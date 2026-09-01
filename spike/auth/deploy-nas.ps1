# Zet de auth-spike-bundel op de NAS (issue #17).
#
#   Bundel -> /volume1/web/authspike/  -> https://nas.vandehaar.dev/authspike/
#
# Dit script rolt ALLEEN de bundel uit. De media, de .htaccess-bestanden en de
# .htpasswd-bestanden staan al op de NAS en worden hier bewust niet aangeraakt,
# want daar zitten wachtwoorden in en die horen niet in een publieke repo.
#
# Zoals ze eenmalig zijn aangemaakt, voor als het opnieuw moet:
#
#   ssh: cp -a /volume1/web/spike/media /volume1/web/authspike/media
#        cp /volume1/web/spike/{canary.png,icon-180.png,icon-512.png} /volume1/web/authspike/
#        cp /volume1/web/spike/media/{photo.jpg,canary.txt} /volume1/web/authspike/realm2/
#   scp: htaccess-main    -> /volume1/web/authspike/.htaccess
#        htaccess-realm2  -> /volume1/web/authspike/realm2/.htaccess
#   ssh: HT=/var/packages/Apache2.4/target/usr/local/bin/htpasswd
#        $HT -bc /volume1/web/.htpasswd-authspike        ipad     '<wachtwoord>'
#        $HT -b  /volume1/web/.htpasswd-authspike        laptop   '<wachtwoord>'
#        $HT -b  /volume1/web/.htpasswd-authspike        telefoon '<wachtwoord>'
#        $HT -bc /volume1/web/.htpasswd-authspike-realm2 niemand  '<wachtwoord dat niemand kent>'
#        chmod a+r /volume1/web/.htpasswd-authspike*
#
# LET OP: de drempel werkt alleen als Web Station's back-end op Apache 2.4 staat.
# Op nginx wordt .htaccess genegeerd en is er geen drempel.

param(
  [string]$NasUser = 'vandehaar',
  [string]$NasHost = '192.168.0.137',
  [string]$WebRoot = '/volume1/web/authspike',
  [string]$KeyFile = "$env:USERPROFILE\.ssh\rememberwhen_nas_ed25519"
)

$ErrorActionPreference = 'Stop'
$target = "$NasUser@$NasHost"
$ssh    = @('-i', $KeyFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')

# -O dwingt het oude scp-protocol af. OpenSSH 9 gebruikt standaard SFTP, en dat
# subsysteem staat op deze DSM uit: je krijgt dan "dest open ... No such file or
# directory" op een map die aantoonbaar bestaat.
$scp = $ssh + '-O'

function Invoke-Nas([string]$cmd) { & ssh @ssh $target $cmd }

Write-Host "== Bundel kopieren naar $target ==" -ForegroundColor Cyan
$bundle = 'index.html', 'auth.js', 'sw.js', 'manifest.webmanifest', 'catalogue.json'
foreach ($f in $bundle) {
  & scp @scp (Join-Path $PSScriptRoot $f) "${target}:$WebRoot/$f"
}

# Web Station serveert als de groep 'http'. Zonder leesrecht krijg je een
# DSM-foutpagina in plaats van de app.
Write-Host "== Rechten zetten voor de http-groep ==" -ForegroundColor Cyan
Invoke-Nas "chmod -R o+rX '$WebRoot' && ls -la '$WebRoot'"

Write-Host "== Controle vanaf deze machine ==" -ForegroundColor Cyan
# Zonder credential hoort dit 401 te zijn zodra de back-end Apache is, en 200
# zolang hij nog op nginx staat. Dat verschil is zelf de eerste meting.
foreach ($u in @(
    'https://nas.vandehaar.dev/authspike/',
    'https://nas.vandehaar.dev/authspike/media/photo.jpg',
    'https://nas.vandehaar.dev/authspike/realm2/photo.jpg',
    'https://nas.vandehaar.dev/spike/media/photo.jpg')) {
  try {
    $r = Invoke-WebRequest -Uri $u -Method Head -SkipHttpErrorCheck -TimeoutSec 15
    "{0,-3} {1,-34} {2}" -f $r.StatusCode, ($r.Headers['WWW-Authenticate'] -join ''), $u
  } catch {
    "ERR                                    $u  --  $($_.Exception.Message)"
  }
}

Write-Host "`nKlaar. Open op de iPad: https://nas.vandehaar.dev/authspike/" -ForegroundColor Green
