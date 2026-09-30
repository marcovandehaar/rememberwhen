# Installeert de apparaatsleutel-drempel op de NAS (ADR 0007), in plaats van Basic-auth.
#
#   nas/htaccess.template  -> /volume1/web/.htaccess   (na een back-up van de oude)
#   nas/enrol/index.php    -> /volume1/web/enrol/
#   nas/devices/.htaccess  -> /volume1/web/devices/    (de sleutelbestanden zelf)
#
# -Stage installeert hetzelfde in /volume1/web/stage/ (met een eigen wachtwoord en
# zonder de echte drempel aan te raken), om de hele keten te testen voordat de
# echte .htaccess wordt vervangen.
#
# Terugdraaien: op de NAS `cp /volume1/web/.htaccess.basic-backup /volume1/web/.htaccess`.
#
# Het huishoudwachtwoord: met -ChoosePassword kies je het zelf (verborgen invoer,
# twee keer); anders wordt er een gegenereerd en één keer getoond. Op de NAS staat
# alleen de bcrypt-hash (devices/.enrol-secret). Nieuw wachtwoord: -ResetPassword
# of nogmaals -ChoosePassword.

param(
  [string]$NasUser = 'vandehaar',
  [string]$NasHost = '192.168.0.137',
  [string]$WebRoot = '/volume1/web',
  [string]$KeyFile = "$env:USERPROFILE\.ssh\rememberwhen_nas_ed25519",
  [switch]$Stage,
  [switch]$ResetPassword,
  [switch]$ChoosePassword
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$nas      = Join-Path $repoRoot 'nas'
$target   = "$NasUser@$NasHost"
$php      = '/usr/local/bin/php83'

$ssh = @('-i', $KeyFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new',
         '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=3')
$scp = $ssh + '-O'

function Invoke-Nas([string]$cmd) {
  & ssh @ssh $target $cmd
  if ($LASTEXITCODE -ne 0) { throw "ssh-commando mislukte (exit ${LASTEXITCODE}): $cmd" }
}

# Apache leest een .htaccess met CRLF of een verdwaald \r als onderdeel van de
# waarde; dus alles wat naar de NAS gaat, gaat met LF en zonder BOM.
function Send-File([string]$content, [string]$remotePath) {
  $tmp = New-TemporaryFile
  try {
    [System.IO.File]::WriteAllText($tmp.FullName, ($content -replace "`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))
    & scp @scp $tmp.FullName "${target}:$remotePath"
    if ($LASTEXITCODE -ne 0) { throw "scp mislukte voor $remotePath (exit ${LASTEXITCODE})" }
  } finally { Remove-Item $tmp -Force }
}

$root = if ($Stage) { "$WebRoot/stage" } else { $WebRoot }
$base = if ($Stage) { '/stage/' } else { '/' }
$url  = "https://nas.vandehaar.dev$base"

Write-Host "== Mappen klaarzetten in $root ==" -ForegroundColor Cyan
Invoke-Nas "mkdir -p '$root/enrol' '$root/devices' && chmod a+rwx '$root/devices'"

Write-Host "== Aanmeldpagina en sleutelmap ==" -ForegroundColor Cyan
Send-File (Get-Content (Join-Path $nas 'enrol\index.php') -Raw) "$root/enrol/index.php"
Send-File (Get-Content (Join-Path $nas 'devices\.htaccess') -Raw) "$root/devices/.htaccess"
Invoke-Nas "chmod a+r '$root/enrol/index.php' '$root/devices/.htaccess'"

$hasSecret = $false
& ssh @ssh $target "test -s '$root/devices/.enrol-secret'"
if ($LASTEXITCODE -eq 0) { $hasSecret = $true }

if ($ResetPassword -or $ChoosePassword -or -not $hasSecret) {
  Write-Host "== Huishoudwachtwoord instellen ==" -ForegroundColor Cyan
  if ($ChoosePassword) {
    # Zelf kiezen: het gaat verborgen van jouw toetsenbord rechtstreeks naar de NAS,
    # die alleen de bcrypt-hash bewaart. Minstens 12 tekens; het wordt 1x per apparaat getypt.
    while ($true) {
      $first  = Read-Host 'Kies het huishoudwachtwoord (minstens 12 tekens)' -AsSecureString
      $second = Read-Host 'Nog een keer' -AsSecureString
      $password = [System.Net.NetworkCredential]::new('', $first).Password
      if ($password -ne [System.Net.NetworkCredential]::new('', $second).Password) { Write-Host 'Die twee zijn niet gelijk. Opnieuw.' -ForegroundColor Yellow; continue }
      if ($password.Length -lt 12) { Write-Host 'Te kort: minstens 12 tekens. Opnieuw.' -ForegroundColor Yellow; continue }
      break
    }
  } else {
    # Geen l/1/0/o/i: het wordt wel eens overgetypt.
    $alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
    $bytes = [byte[]]::new(20)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $chars = $bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] }
    $password = (0..3 | ForEach-Object { -join $chars[($_ * 5)..($_ * 5 + 4)] }) -join '-'
  }
  $password | & ssh @ssh $target "$php -r 'echo password_hash(trim(fgets(STDIN)), PASSWORD_BCRYPT);' > '$root/devices/.enrol-secret' && chmod a+r '$root/devices/.enrol-secret'"
  if ($LASTEXITCODE -ne 0) { throw 'Wachtwoord instellen mislukte.' }
  if ($ChoosePassword) {
    Write-Host "`nHuishoudwachtwoord ingesteld.`n" -ForegroundColor Green
  } else {
    Write-Host "`nHuishoudwachtwoord (eenmalig getoond, bewaar het in je wachtwoordmanager):" -ForegroundColor Yellow
    Write-Host "  $password`n" -ForegroundColor Yellow
  }
}

$gate = (Get-Content (Join-Path $nas 'htaccess.template') -Raw).Replace('{{ROOT}}', $root).Replace('{{BASE}}', $base)

if ($Stage) {
  # Een map onder de echte webroot valt onder de Basic-drempel van de hoofd-.htaccess;
  # voor de test moet die eruit, anders komt niets ooit bij onze regels.
  $gate = "Require all granted`n`n" + $gate
  Write-Host "== Testbestanden ==" -ForegroundColor Cyan
  Send-File '{"stage":true}' "$root/catalog.json"
  Send-File 'ok' "$root/probe.txt"
  Invoke-Nas "chmod a+r '$root/catalog.json' '$root/probe.txt'"
  Send-File $gate "$root/.htaccess"
  Invoke-Nas "chmod a+r '$root/.htaccess'"
  Write-Host "`nStaging klaar: $url" -ForegroundColor Green
  return
}

Write-Host "== Back-up van de huidige .htaccess ==" -ForegroundColor Cyan
Invoke-Nas "test -e '$root/.htaccess.basic-backup' || cp '$root/.htaccess' '$root/.htaccess.basic-backup'"

Write-Host "== Drempel omzetten (atomair) ==" -ForegroundColor Cyan
Send-File $gate "$root/.htaccess.new"
Invoke-Nas "chmod a+r '$root/.htaccess.new' && mv -f '$root/.htaccess.new' '$root/.htaccess'"

Write-Host "== Controle vanaf deze machine ==" -ForegroundColor Cyan
foreach ($p in @('', 'enrol/', 'manifest.webmanifest', 'catalog.json')) {
  $r = Invoke-WebRequest -Uri "$url$p" -Method Head -SkipHttpErrorCheck -TimeoutSec 15
  "{0,-3} {1}" -f $r.StatusCode, "/$p"
}
Write-Host "`nVerwacht zonder sleutel: 403 voor / en catalog.json, 200 voor enrol/ en het manifest." -ForegroundColor Cyan
Write-Host "Terugdraaien: cp $root/.htaccess.basic-backup $root/.htaccess" -ForegroundColor Cyan
