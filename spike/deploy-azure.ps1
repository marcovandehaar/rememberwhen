# Zet de spike-bundel op een Azure Static Web App -- de publieke origin.
#
# Waarom Azure en niet iets goedkopers: dit is de host waar de echte app ook
# op komt, en de deploy hoort straks als script naast de indexer te staan.
# Dit script is de eerste versie daarvan.
#
# De media komen NIET mee. Die staan op de NAS; dat de pagina ze van een
# andere origin moet halen is nu juist het hele punt van de spike.
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

  # Free-SKU: geen kosten, geen custom domein nodig, en de standaard
  # *.azurestaticapps.net-naam is een gewone publieke HTTPS-origin -- meer
  # heeft de spike niet nodig.
  Write-Host "== Static Web App (Free) ==" -ForegroundColor Cyan
  az staticwebapp create `
    --name $AppName --resource-group $ResourceGroup `
    --location $Location --sku Free --output none
}

$token = az staticwebapp secrets list --name $AppName --resource-group $ResourceGroup `
  --query 'properties.apiKey' --output tsv
if (-not $token) { throw "Geen deployment token gevonden voor $AppName" }

Write-Host "== Uploaden ==" -ForegroundColor Cyan
Push-Location $PSScriptRoot
try {
  npx --yes @azure/static-web-apps-cli@latest deploy . `
    --deployment-token $token --env production --no-use-keychain
} finally { Pop-Location }

$hostName = az staticwebapp show --name $AppName --resource-group $ResourceGroup `
  --query 'defaultHostname' --output tsv
Write-Host "`nOpen op de iPad: https://$hostName/index.html" -ForegroundColor Green
