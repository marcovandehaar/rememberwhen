# Bouwt de frontend en publiceert 'm naar de webroot van de NAS (ADR 0004).
#
#   frontend/dist -> /volume1/web/  -> https://nas.vandehaar.dev/
#
# Publiceert daarnaast, zonder extra vlag nodig, de output van de Indexer-UI
# (#30): catalog.json + media/ landen in de root van diezelfde webroot, naast
# index.html — precies waar App.tsx's CATALOG_URL ('/catalog.json') en de
# root-relatieve mediaRef/coverImage-paden uit het schema ze verwachten. De
# bron daarvoor is gewoon de Indexer-UI's eigen ingestelde Output-locatie
# (indexer/config.json's outputFolder) — zo staat elke net geïndexeerde map
# na dit script meteen live, zonder dat je zelf het pad hoeft op te zoeken.
# -IndexerOutput overschrijft die auto-detectie (of geeft '' om 'm over te
# slaan); zonder config.json, of zonder catalog.json op die locatie, wordt
# de indexer-output stilletjes overgeslagen — alleen dist/ gaat dan mee.
#
# Dit script raakt de .htaccess en .htpasswd-bestanden op de webroot niet aan:
# die bevatten het Basic-auth-credential en horen niet in een publieke repo of
# een script dat per deploy opnieuw draait. Inhoud van /volume1/web/.htaccess
# (ADR 0004 — de AddType-regel is de randvoorwaarde uit issue #17 die anders
# spoorloos verdwijnt als het bestand ooit opnieuw wordt aangemaakt):
#
#   AuthType Basic
#   AuthName "rememberwhen"
#   AuthUserFile /volume1/web/.htpasswd-app
#   Require valid-user
#
#   AddType application/manifest+json .webmanifest
#
# Zoals het credential-bestand eenmalig is aangemaakt:
#
#   ssh: HT=/var/packages/Apache2.4/target/usr/local/bin/htpasswd
#        $HT -mc /volume1/web/.htpasswd-app ipad '<wachtwoord>'
#        chmod a+r /volume1/web/.htpasswd-app
#
# LET OP: de drempel werkt alleen als Web Station's back-end op Apache 2.4 staat.
# Op nginx wordt .htaccess genegeerd en is er geen drempel.

param(
  [string]$NasUser = 'vandehaar',
  [string]$NasHost = '192.168.0.137',
  [string]$WebRoot = '/volume1/web',
  [string]$KeyFile = "$env:USERPROFILE\.ssh\rememberwhen_nas_ed25519",
  [string]$IndexerOutput
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist     = Join-Path $repoRoot 'frontend\dist'
$target   = "$NasUser@$NasHost"

# Tried SSH ControlMaster/ControlPath here to reuse one connection across
# every mkdir/rm/scp call instead of a fresh handshake each time (#47) — it
# hung partway through a real run. This build of Windows OpenSSH silently
# appends a random suffix to ControlPath per invocation instead of reusing
# the exact socket, so later calls can't reliably find the master. Reverted
# rather than ship something that occasionally deadlocks a deploy; a safe
# win (deduping the repeated per-file `mkdir` calls below) stayed.
$ssh = @('-i', $KeyFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')

# Mirrors UiServer.cs's ResolveRelativeToConfig: a rooted outputFolder (the
# common case — a NAS UNC path) is used as-is, a relative one resolves
# against config.json's own directory, same as the Indexer-UI itself does.
if (-not $PSBoundParameters.ContainsKey('IndexerOutput')) {
  $indexerConfigPath = Join-Path $repoRoot 'indexer\config.json'
  if (Test-Path $indexerConfigPath) {
    $outputFolder = (Get-Content $indexerConfigPath -Raw | ConvertFrom-Json).outputFolder
    if ($outputFolder) {
      $IndexerOutput = if ([System.IO.Path]::IsPathRooted($outputFolder)) { $outputFolder }
        else { Join-Path (Split-Path -Parent $indexerConfigPath) $outputFolder }
    }
  }
  if ($IndexerOutput -and -not (Test-Path (Join-Path $IndexerOutput 'catalog.json'))) {
    Write-Host "Indexer-output op $IndexerOutput heeft nog geen catalog.json — sla over, alleen dist/ wordt gepubliceerd." -ForegroundColor Yellow
    $IndexerOutput = ''
  }
}

# -O dwingt het oude scp-protocol af. OpenSSH 9 gebruikt standaard SFTP, en dat
# subsysteem staat op deze DSM uit: je krijgt dan "dest open ... No such file or
# directory" op een map die aantoonbaar bestaat.
$scp = $ssh + '-O'

function Invoke-Nas([string]$cmd) { & ssh @ssh $target $cmd }
function Get-RelativePath([string]$root, [System.IO.FileInfo]$file) {
  $file.FullName.Substring($root.Length + 1).Replace('\', '/')
}

Write-Host "== Frontend bouwen ==" -ForegroundColor Cyan
Push-Location (Join-Path $repoRoot 'frontend')
try { npm run build } finally { Pop-Location }

if (-not (Test-Path $dist)) { throw "Build leverde geen $dist op." }

# Beide bronnen publiceren naar dezelfde webroot-root: dist/ (de app) en,
# optioneel, de Indexer-output (catalog.json + media/, #30). Los houden zou
# betekenen dat de root-relatieve mediaRef/coverImage-paden uit het
# catalogus-schema een sub-pad moeten kennen dat nergens is vastgelegd.
#
# De Indexer-output-bron beperkt zich expliciet tot catalog.json en media/ —
# niet de hele root recursief. Die root is ook waar de Indexer-UI's eigen
# Output-locatie kan samenvallen met een NAS-share die nog meer bevat (een
# Synology '#recycle'-map bijvoorbeeld, ontoegankelijk voor deze credential
# en dus een harde Get-ChildItem-fout) — en zelfs zonder dat zou alles
# recursief meenemen ook per ongeluk curatie-logs kunnen publiceren als die
# toevallig onder dezelfde root staan.
$sources = @(@{ Root = $dist; Label = 'dist/'; Items = $null })
if ($IndexerOutput) {
  # .ProviderPath, not .Path: Resolve-Path prefixes a UNC path's .Path with
  # its provider qualifier ("Microsoft.PowerShell.Core\FileSystem::\\..."),
  # which then silently breaks Get-RelativePath's plain Substring below.
  $indexerRoot = (Resolve-Path $IndexerOutput).ProviderPath
  if (-not (Test-Path (Join-Path $indexerRoot 'catalog.json'))) {
    throw "$indexerRoot bevat geen catalog.json (is dit een Indexer-outputmap?)"
  }
  $sources += @{ Root = $indexerRoot; Label = "$IndexerOutput"; Items = @('catalog.json', 'media') }
}

# -Recurse on a *file* path (catalog.json, not media/) has been observed to
# fall back to scanning its parent directory instead of just returning that
# file — fatal here since the parent (a NAS share root) can hold a Synology
# '#recycle' folder this credential can't read. Only pass -Recurse for an
# actual directory; a file item never needs it.
$entries = foreach ($source in $sources) {
  $files = if ($source.Items) {
    $source.Items | ForEach-Object { Join-Path $source.Root $_ } | Where-Object { Test-Path $_ } |
      ForEach-Object {
        if (Test-Path $_ -PathType Container) { Get-ChildItem -Path $_ -Recurse -File -Force }
        else { Get-Item -Path $_ -Force }
      }
  } else {
    Get-ChildItem -Path $source.Root -Recurse -File -Force
  }
  foreach ($file in $files) { @{ Source = $source; File = $file } }
}
$total = $entries.Count
# A plain, greppable line on its own — Write-Host's Information stream isn't
# reliably captured by a process launched with redirected stdout (the
# Indexer-UI's "Publiceren"-knop, #47), so progress goes out as ordinary
# Write-Output instead, one line per file, interleaved with the Write-Host
# section headers below (which stay for a human reading the console directly).
Write-Output "PROGRESS 0 $total"

$allRemotePaths = @()
$madeDirs = [System.Collections.Generic.HashSet[string]]::new()
$done = 0
$currentLabel = $null
foreach ($entry in $entries) {
  $source = $entry.Source
  if ($source.Label -ne $currentLabel) {
    Write-Host "== $($source.Label) kopieren naar ${target}:$WebRoot ==" -ForegroundColor Cyan
    $currentLabel = $source.Label
  }

  $file = $entry.File
  $relDir = Split-Path (Get-RelativePath $source.Root $file) -Parent
  # scp -r's map-aanmaak op de remote bleek onbetrouwbaar zodra hij vlak na een
  # ssh-commando in hetzelfde script liep (zelfde bron/doel, kale herhaling
  # buiten het script om werkte wél) — dus geen scp -r op mappen, wel mkdir
  # per bestand. Nu de SSH-verbinding hergebruikt wordt (zie hierboven) is
  # elke aanroep goedkoop, maar honderden identieke 'mkdir media' voor
  # dezelfde map blijft pure winst om over te slaan — vandaar de dedupe.
  if ($relDir -and $madeDirs.Add("$($source.Root)|$relDir")) { Invoke-Nas "mkdir -p '$WebRoot/$relDir'" }

  # Bestaande bestanden eerst verwijderen, want scp overschrijft de inhoud
  # van een reeds bestaand bestand van een andere eigenaar (http) wel, maar
  # chmod erna niet.
  $remotePath = "$WebRoot/$(Get-RelativePath $source.Root $file)"
  Invoke-Nas "rm -f '$remotePath'"
  & scp @scp $file.FullName "${target}:$remotePath"
  $allRemotePaths += $remotePath

  $done++
  Write-Output "PROGRESS $done $total"
}

# Web Station serveert als de groep 'http'. Zonder leesrecht krijg je een
# DSM-foutpagina in plaats van de app. Alleen de zojuist geüploade paden
# aanraken: de rest van de webroot is van 'http'/'root' en niet van ons om
# te chmod'en (en dat mislukt toch als we het proberen).
#
# In batches, niet één ssh-aanroep met alle paden: met een volle Indexer-
# output (2000+ bestanden) overschrijdt die ene commandline Windows' limiet
# voor CreateProcess — "ssh.exe failed to run ... filename or extension is
# too long" — pas zichtbaar zodra dit script voor het eerst echt tot hier
# doorliep (#47). 200 paden per batch blijft ruim onder die grens.
Write-Host "== Rechten zetten voor de http-groep ==" -ForegroundColor Cyan
$batchSize = 200
for ($i = 0; $i -lt $allRemotePaths.Count; $i += $batchSize) {
  $batch = $allRemotePaths[$i..[Math]::Min($i + $batchSize - 1, $allRemotePaths.Count - 1)]
  $quotedPaths = ($batch | ForEach-Object { "'$_'" }) -join ' '
  Invoke-Nas "chmod o+rX $quotedPaths"
}

Write-Host "== Controle vanaf deze machine ==" -ForegroundColor Cyan
# Zonder credential hoort dit 401 te zijn zodra de .htaccess op zijn plek staat.
try {
  $r = Invoke-WebRequest -Uri 'https://nas.vandehaar.dev/' -Method Head -SkipHttpErrorCheck -TimeoutSec 15
  "{0,-3} {1}" -f $r.StatusCode, ($r.Headers['WWW-Authenticate'] -join '')
} catch {
  "ERR  $($_.Exception.Message)"
}

Write-Host "`nKlaar. Open op de iPad: https://nas.vandehaar.dev/" -ForegroundColor Green
