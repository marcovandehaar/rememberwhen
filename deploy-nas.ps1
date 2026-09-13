# Bouwt de frontend en publiceert 'm naar de webroot van de NAS (ADR 0004).
#
#   frontend/dist -> /volume1/web/  -> https://nas.vandehaar.dev/
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
  [string]$KeyFile = "$env:USERPROFILE\.ssh\rememberwhen_nas_ed25519"
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist     = Join-Path $repoRoot 'frontend\dist'
$target   = "$NasUser@$NasHost"
$ssh      = @('-i', $KeyFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')

# -O dwingt het oude scp-protocol af. OpenSSH 9 gebruikt standaard SFTP, en dat
# subsysteem staat op deze DSM uit: je krijgt dan "dest open ... No such file or
# directory" op een map die aantoonbaar bestaat.
$scp = $ssh + '-O'

function Invoke-Nas([string]$cmd) { & ssh @ssh $target $cmd }
function Get-RelativePath([System.IO.FileInfo]$file) {
  $file.FullName.Substring($dist.Length + 1).Replace('\', '/')
}

Write-Host "== Frontend bouwen ==" -ForegroundColor Cyan
Push-Location (Join-Path $repoRoot 'frontend')
try { npm run build } finally { Pop-Location }

if (-not (Test-Path $dist)) { throw "Build leverde geen $dist op." }

Write-Host "== dist/ kopieren naar ${target}:$WebRoot ==" -ForegroundColor Cyan
# scp -r's map-aanmaak op de remote bleek onbetrouwbaar zodra hij vlak na een
# ssh-commando in hetzelfde script liep (zelfde bron/doel, kale herhaling
# buiten het script om werkte wél) — dus geen scp -r op mappen. In plaats
# daarvan: elke map expliciet aanmaken via ssh, en dan alleen bestanden
# (nooit mappen) los kopiëren naar hun exacte doelpad. Bestaande bestanden
# eerst verwijderen, want scp overschrijft de inhoud van een reeds bestaand
# bestand van een andere eigenaar (http) wel, maar chmod erna niet.
$files = Get-ChildItem -Path $dist -Recurse -File -Force
$relDirs = $files | ForEach-Object { Split-Path (Get-RelativePath $_) -Parent } |
  Where-Object { $_ } | Select-Object -Unique
foreach ($relDir in $relDirs) {
  Invoke-Nas "mkdir -p '$WebRoot/$relDir'"
}

$remotePaths = foreach ($file in $files) {
  $remotePath = "$WebRoot/$(Get-RelativePath $file)"
  Invoke-Nas "rm -f '$remotePath'"
  & scp @scp $file.FullName "${target}:$remotePath"
  $remotePath
}

# Web Station serveert als de groep 'http'. Zonder leesrecht krijg je een
# DSM-foutpagina in plaats van de app. Alleen de zojuist geüploade paden
# aanraken: de rest van de webroot is van 'http'/'root' en niet van ons om
# te chmod'en (en dat mislukt toch als we het proberen).
Write-Host "== Rechten zetten voor de http-groep ==" -ForegroundColor Cyan
$quotedPaths = ($remotePaths | ForEach-Object { "'$_'" }) -join ' '
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
