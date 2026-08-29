# Zet de spike-bundel op een Azure Static Web App -- de publieke origin.
#
# Waarom Azure en niet iets goedkopers: dit is de host waar de echte app ook
# op komt, en de deploy hoort straks als script naast de indexer te staan.
# Dit script is de eerste versie daarvan.
#
# De media komen NIET mee. Die staan op de NAS; dat de pagina ze van een
# andere origin moet halen is nu juist het hele punt van de spike. Er wordt
# gedeployed vanuit een schone staging-map, zodat de deploy-scripts en de
# README niet op een publieke URL belanden.
#
#   .\deploy-azure.ps1 -Create        eerste keer: maakt de resource aan
#   .\deploy-azure.ps1                daarna: alleen de bundel bijwerken

param(
  [string]$ResourceGroup = 'rg-rememberwhen-spike',
  [string]$AppName       = 'swa-rememberwhen-spike',
  [string]$Location      = 'westeurope',
  [string]$Subscription  = '',
  [switch]$Create
)

$ErrorActionPreference = 'Stop'

if ($Subscription) { az account set --subscription $Subscription }
$acct = az account show --output json | ConvertFrom-Json
Write-Host "Abonnement: $($acct.name)  ($($acct.user.name))" -ForegroundColor Yellow

if ($Create) {
  Write-Host "== Resourcegroep ==" -ForegroundColor Cyan
  az group create --name $ResourceGroup --location $Location --output none

  # Free-SKU: geen kosten, en de standaard *.azurestaticapps.net-naam is een
  # gewone publieke HTTPS-origin -- meer heeft de spike niet nodig.
  Write-Host "== Static Web App (Free) ==" -ForegroundColor Cyan
  az staticwebapp create --name $AppName --resource-group $ResourceGroup `
    --location $Location --sku Free --output none
}

$token = az staticwebapp secrets list --name $AppName --resource-group $ResourceGroup `
  --query 'properties.apiKey' --output tsv
if (-not $token) { throw "Geen deployment token gevonden voor $AppName" }

# De `swa deploy`-wrapper van de CLI faalt op deze machine met "deployment
# binary exited with code 1" en geen verdere melding, terwijl de binary die hij
# eronder gebruikt het prima doet. Dus: de CLI wordt alleen nog gebruikt om die
# binary op te halen, en daarna roepen we hem zelf aan.
function Get-StaticSitesClient {
  $found = Get-ChildItem "$env:USERPROFILE\.swa\deploy\*\StaticSitesClient.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($found) { return $found.FullName }

  Write-Host "Binary nog niet aanwezig -- de CLI haalt hem op (de deploy zelf mag falen)." -ForegroundColor DarkGray
  npx --yes @azure/static-web-apps-cli@latest deploy . --deployment-token $token 2>&1 | Out-Null

  $found = Get-ChildItem "$env:USERPROFILE\.swa\deploy\*\StaticSitesClient.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $found) { throw "StaticSitesClient.exe niet gevonden onder ~\.swa\deploy" }
  return $found.FullName
}

$stage = Join-Path $env:TEMP 'swa-rememberwhen-spike'
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $stage -Force | Out-Null
$bundle = 'index.html', 'spike.js', 'sw.js', 'manifest.webmanifest',
          'icon-180.png', 'icon-512.png', 'canary.png', 'staticwebapp.config.json'
foreach ($f in $bundle) { Copy-Item (Join-Path $PSScriptRoot $f) $stage }

Write-Host "== Uploaden ($($bundle.Count) bestanden) ==" -ForegroundColor Cyan
$exe = Get-StaticSitesClient
& $exe upload --app $stage --apiToken $token --skipAppBuild true --verbose |
  Select-String -Pattern 'Status:|Deployment Complete|Visit your site|ERROR|Failed'

$hostName = az staticwebapp show --name $AppName --resource-group $ResourceGroup `
  --query 'defaultHostname' --output tsv
Write-Host "`nOpen op de iPad: https://$hostName/index.html" -ForegroundColor Green
