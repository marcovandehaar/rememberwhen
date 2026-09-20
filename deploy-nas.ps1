# Bouwt de frontend en publiceert 'm naar de webroot van de NAS (ADR 0004).
#
#   frontend/dist -> /volume1/web/  -> https://nas.vandehaar.dev/
#
# Publiceert daarnaast de Indexer-UI's eigen output (#30): catalog.json en
# specifieke media/-bestanden landen in de root van diezelfde webroot, naast
# index.html — precies waar App.tsx's CATALOG_URL ('/catalog.json') en de
# root-relatieve mediaRef/coverImage-paden uit het schema ze verwachten.
#
# Welke Indexer-outputbestanden dat zijn, bepaalt dit script niet meer zelf.
# -PendingFilesJson wijst naar een JSON-bestand met een array van paden,
# relatief aan de Indexer-UI's Output-locatie (indexer/config.json's
# outputFolder) — geschreven door UiServer.cs vanuit de publiceer-wachtrij
# (zie PendingPublish.cs: elke actie die iets publiceerbaars verandert —
# herindexeren, een cover zetten, een foto of map verwijderen — logt daar
# precies wat er gepubliceerd moet worden, in plaats van dat dit script de
# hele Indexer-output steeds opnieuw scant en met een lokaal manifest
# vergelijkt). Zonder dat bestand, of met een lege lijst, gaat alleen dist/
# mee — dus ook een handmatige `pwsh ./deploy-nas.ps1` zonder die vlag
# publiceert geen foto's meer, enkel de frontend-build.
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
  [string]$IndexerOutput,
  [string]$PendingFilesJson
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
#
# ConnectTimeout/ServerAlive*: a real Denmark-2023 publish (505 files) hung
# for 10+ minutes on a single `rm -f` — the TCP connection stayed
# ESTABLISHED but nothing was flowing, and plain ssh has no default liveness
# check, so it waited forever. These make OpenSSH itself notice a stalled
# session (no keepalive reply within ~15s) and give up instead of hanging.
$ssh = @('-i', $KeyFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new',
         '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=3')

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
}

# -O dwingt het oude scp-protocol af. OpenSSH 9 gebruikt standaard SFTP, en dat
# subsysteem staat op deze DSM uit: je krijgt dan "dest open ... No such file or
# directory" op een map die aantoonbaar bestaat.
$scp = $ssh + '-O'

# $ErrorActionPreference = 'Stop' only turns PowerShell's own non-terminating
# errors into terminating ones — it does not look at a native exe's exit
# code, so an ssh/scp call that actually failed would otherwise be silently
# treated as success and the script would carry on regardless.
function Invoke-Nas([string]$cmd) {
  & ssh @ssh $target $cmd
  if ($LASTEXITCODE -ne 0) { throw "ssh-commando mislukte (exit ${LASTEXITCODE}): $cmd" }
}
function Get-RelativePath([string]$root, [System.IO.FileInfo]$file) {
  $file.FullName.Substring($root.Length + 1).Replace('\', '/')
}

Write-Host "== Frontend bouwen ==" -ForegroundColor Cyan
Push-Location (Join-Path $repoRoot 'frontend')
try { npm run build } finally { Pop-Location }

if (-not (Test-Path $dist)) { throw "Build leverde geen $dist op." }

# dist/ gaat altijd volledig mee — drie kleine, content-gehashte bestanden,
# geen publiceer-wachtrij nodig (het is code, geen Indexer-content).
$sources = @(@{ Root = $dist; Label = 'dist/'; Files = @(Get-ChildItem -Path $dist -Recurse -File -Force) })

if ($IndexerOutput -and $PendingFilesJson -and (Test-Path $PendingFilesJson)) {
  # .ProviderPath, not .Path: Resolve-Path prefixes a UNC path's .Path with
  # its provider qualifier ("Microsoft.PowerShell.Core\FileSystem::\\..."),
  # which then silently breaks Get-RelativePath's plain Substring below.
  $indexerRoot = (Resolve-Path $IndexerOutput).ProviderPath
  $relativePaths = @(Get-Content $PendingFilesJson -Raw | ConvertFrom-Json)
  $pendingFiles = foreach ($rel in $relativePaths) {
    $full = Join-Path $indexerRoot $rel
    if (Test-Path $full -PathType Leaf) { Get-Item -Path $full -Force }
    else { Write-Host "Overgeslagen (niet (meer) gevonden): $rel" -ForegroundColor Yellow }
  }
  if ($pendingFiles) {
    $sources += @{ Root = $indexerRoot; Label = "$IndexerOutput"; Files = @($pendingFiles) }
  }
}

$entries = foreach ($source in $sources) {
  foreach ($file in $source.Files) { @{ Source = $source; File = $file } }
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
  if ($LASTEXITCODE -ne 0) { throw "scp mislukte voor $remotePath (exit ${LASTEXITCODE})" }
  $allRemotePaths += $remotePath

  $done++
  Write-Output "PROGRESS $done $total"
}

# Web Station serveert als de groep 'http'. Zonder leesrecht krijg je een
# DSM-foutpagina in plaats van de app. Alleen de zojuist geüploade paden
# aanraken: de rest van de webroot is van 'http'/'root' en niet van ons om
# te chmod'en (en dat mislukt toch als we het proberen).
#
# In batches, niet één ssh-aanroep met alle paden: bij een grote herindexering
# (honderden bestanden voor één Memory) overschrijdt één te lange commandline
# Windows' limiet voor CreateProcess — "ssh.exe failed to run ... filename or
# extension is too long" (#47). 200 paden per batch blijft ruim onder die grens.
Write-Host "== Rechten zetten voor de http-groep ==" -ForegroundColor Cyan
$batchSize = 200
for ($i = 0; $i -lt $allRemotePaths.Count; $i += $batchSize) {
  $batch = $allRemotePaths[$i..[Math]::Min($i + $batchSize - 1, $allRemotePaths.Count - 1)]
  $quotedPaths = ($batch | ForEach-Object { "'$_'" }) -join ' '
  Invoke-Nas "chmod o+rX $quotedPaths"
}

Write-Host "== Controle vanaf deze machine ==" -ForegroundColor Cyan
# Zonder credential hoort dit 401 te zijn zodra de .htaccess op zijn plek staat.
#
# -TimeoutSec bleek geen garantie: dezelfde publish waarbij de rm -f hierboven
# vasthing, zag deze aanroep daarna óók vasthangen (een TLS-renegotiatie op
# nas.vandehaar.dev die maar niet klaar was) terwijl alle 505 bestanden en de
# rechten allang goed stonden — waardoor de hele run als mislukt gold en de
# publiceer-wachtrij niet leegde. Een aparte Job met een eigen, wél afdwingbare
# Wait-Job -Timeout kan dat niet meer: deze stap raakt nooit het eindresultaat.
$checkJob = Start-Job -ScriptBlock {
  try {
    $r = Invoke-WebRequest -Uri 'https://nas.vandehaar.dev/' -Method Head -SkipHttpErrorCheck -TimeoutSec 10
    "{0,-3} {1}" -f $r.StatusCode, ($r.Headers['WWW-Authenticate'] -join '')
  } catch {
    "ERR  $($_.Exception.Message)"
  }
}
if (Wait-Job $checkJob -Timeout 15) { Receive-Job $checkJob }
else { "ERR  Controle duurde te lang (>15s), overgeslagen — de publish zelf is wel voltooid." }
Remove-Job $checkJob -Force

Write-Host "`nKlaar. Open op de iPad: https://nas.vandehaar.dev/" -ForegroundColor Green
