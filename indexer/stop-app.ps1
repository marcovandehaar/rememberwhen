# Stopt de Indexer-webserver hard.
#
# `dotnet run --project indexer` start Indexer.exe als kindproces; Ctrl+C in
# die terminal sluit soms alleen de dotnet-wrapper af en laat Indexer.exe
# zelf doorlopen (met de poort nog vast). Dit script pakt het proces direct
# op naam, ongeacht hoe het gestart is.
#
#   ./indexer/stop-app.ps1
#
# Geen check op een lopende indexeer-run: die heeft geen cancel-endpoint, dus
# hard stoppen halverwege kan een onvolledige Memory/catalogus achterlaten.
# Wacht een lopende run af voor je dit draait.

$ErrorActionPreference = 'Stop'

$processes = Get-Process Indexer -ErrorAction SilentlyContinue
if (-not $processes) {
  Write-Host "Geen Indexer-proces gevonden — staat al stil." -ForegroundColor Green
  exit 0
}

foreach ($p in $processes) {
  Write-Host "Stop Indexer (PID $($p.Id))..." -ForegroundColor Cyan
  Stop-Process -Id $p.Id -Force
}

Write-Host "Gestopt." -ForegroundColor Green
