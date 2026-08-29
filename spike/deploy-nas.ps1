# Zet de spike-bundel en de media-fixtures op de NAS.
#
#   Bundel  -> /volume1/web/spike/          -> https://nas.vandehaar.dev/spike/
#   Media   -> /volume1/web/spike/media/    -> same-origin voor die kopie,
#                                              cross-origin voor de Azure-kopie
#
# De media zijn echte vakantiebestanden. Ze gaan NOOIT in de repo: de web-root
# van de NAS is alleen op het LAN bereikbaar, de repo is publiek.
#
# Eenmalig vooraf: de publieke sleutel uit ~/.ssh/rememberwhen_nas_ed25519.pub
# moet in ~/.ssh/authorized_keys op de NAS staan.

param(
  [string]$NasUser  = 'marco',
  [string]$NasHost  = '192.168.0.137',
  [string]$WebRoot  = '/volume1/web/spike',
  [string]$KeyFile  = "$env:USERPROFILE\.ssh\rememberwhen_nas_ed25519",
  [string]$MediaDir = "$PSScriptRoot\..\prototype\story\public\media",
  [string]$PhotoSrc = 'IMG_7697.jpg',
  [string]$ClipSrc  = 'IMG_7707.mov'
)

$ErrorActionPreference = 'Stop'
$target = "$NasUser@$NasHost"
$ssh    = @('-i', $KeyFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')

function Invoke-Nas([string]$cmd) { & ssh @ssh $target $cmd }

Write-Host "== Mappen aanmaken op $target ==" -ForegroundColor Cyan
Invoke-Nas "mkdir -p '$WebRoot/media'"

Write-Host "== Bundel kopieren ==" -ForegroundColor Cyan
$bundle = 'index.html', 'spike.js', 'sw.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png', 'canary.png'
foreach ($f in $bundle) {
  & scp @ssh (Join-Path $PSScriptRoot $f) "${target}:$WebRoot/$f"
}

Write-Host "== Media-fixtures kopieren ==" -ForegroundColor Cyan
$photo = Join-Path $MediaDir $PhotoSrc
$clip  = Join-Path $MediaDir $ClipSrc
if (-not (Test-Path $photo)) { throw "Foto niet gevonden: $photo" }
if (-not (Test-Path $clip))  { throw "Clip niet gevonden: $clip" }
& scp @ssh $photo "${target}:$WebRoot/media/photo.jpg"
& scp @ssh $clip  "${target}:$WebRoot/media/clip.mov"
Invoke-Nas "printf 'canary %s\n' `$(date -u +%FT%TZ) > '$WebRoot/media/canary.txt'"

# Web Station serveert als de groep 'http'. Zonder leesrecht krijg je een
# DSM-foutpagina in plaats van de app -- de research noemt dit expliciet.
Write-Host "== Rechten zetten voor de http-groep ==" -ForegroundColor Cyan
Invoke-Nas "chmod -R o+rX '$WebRoot' && ls -la '$WebRoot' '$WebRoot/media'"

Write-Host "== Controle vanaf deze machine ==" -ForegroundColor Cyan
foreach ($u in @(
    'https://nas.vandehaar.dev/spike/index.html',
    'https://nas.vandehaar.dev/spike/media/photo.jpg',
    'https://nas.vandehaar.dev/spike/media/clip.mov',
    'http://192.168.0.137/spike/media/photo.jpg')) {
  try {
    $r = Invoke-WebRequest -Uri $u -Method Head -SkipHttpErrorCheck -TimeoutSec 15
    "{0,-3} {1,-22} {2}" -f $r.StatusCode, ($r.Headers['Content-Type'] -join ''), $u
  } catch {
    "ERR                        $u  --  $($_.Exception.Message)"
  }
}

Write-Host "`nKlaar. Open op de iPad: https://nas.vandehaar.dev/spike/" -ForegroundColor Green
