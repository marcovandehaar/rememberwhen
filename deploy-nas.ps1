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
$ssh      = @('-i', $KeyFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')

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
$sources = @(@{ Root = $dist; Label = 'dist/' })
if ($IndexerOutput) {
  $indexerRoot = (Resolve-Path $IndexerOutput).Path
  if (-not (Test-Path (Join-Path $indexerRoot 'catalog.json'))) {
    throw "$indexerRoot bevat geen catalog.json (is dit een Indexer-outputmap?)"
  }
  $sources += @{ Root = $indexerRoot; Label = "$IndexerOutput" }
}

$allRemotePaths = @()
foreach ($source in $sources) {
  Write-Host "== $($source.Label) kopieren naar ${target}:$WebRoot ==" -ForegroundColor Cyan
  # scp -r's map-aanmaak op de remote bleek onbetrouwbaar zodra hij vlak na een
  # ssh-commando in hetzelfde script liep (zelfde bron/doel, kale herhaling
  # buiten het script om werkte wél) — dus geen scp -r op mappen. In plaats
  # daarvan: elke map expliciet aanmaken via ssh, en dan alleen bestanden
  # (nooit mappen) los kopiëren naar hun exacte doelpad. Bestaande bestanden
  # eerst verwijderen, want scp overschrijft de inhoud van een reeds bestaand
  # bestand van een andere eigenaar (http) wel, maar chmod erna niet.
  $files = Get-ChildItem -Path $source.Root -Recurse -File -Force
  $relDirs = $files | ForEach-Object { Split-Path (Get-RelativePath $source.Root $_) -Parent } |
    Where-Object { $_ } | Select-Object -Unique
  foreach ($relDir in $relDirs) {
    Invoke-Nas "mkdir -p '$WebRoot/$relDir'"
  }

  $remotePaths = foreach ($file in $files) {
    $remotePath = "$WebRoot/$(Get-RelativePath $source.Root $file)"
    Invoke-Nas "rm -f '$remotePath'"
    & scp @scp $file.FullName "${target}:$remotePath"
    $remotePath
  }
  $allRemotePaths += $remotePaths
}

# Web Station serveert als de groep 'http'. Zonder leesrecht krijg je een
# DSM-foutpagina in plaats van de app. Alleen de zojuist geüploade paden
# aanraken: de rest van de webroot is van 'http'/'root' en niet van ons om
# te chmod'en (en dat mislukt toch als we het proberen).
Write-Host "== Rechten zetten voor de http-groep ==" -ForegroundColor Cyan
$quotedPaths = ($allRemotePaths | ForEach-Object { "'$_'" }) -join ' '
Invoke-Nas "chmod o+rX $quotedPaths"

Write-Host "== Controle vanaf deze machine ==" -ForegroundColor Cyan
# Zonder credential hoort dit 401 te zijn zodra de .htaccess op zijn plek staat.
try {
  $r = Invoke-WebRequest -Uri 'https://nas.vandehaar.dev/' -Method Head -SkipHttpErrorCheck -TimeoutSec 15
  "{0,-3} {1}" -f $r.StatusCode, ($r.Headers['WWW-Authenticate'] -join '')
} catch {
  "ERR  $($_.Exception.Message)"
}

Write-Host "`nKlaar. Open op de iPad: https://nas.vandehaar.dev/" -ForegroundColor Green
