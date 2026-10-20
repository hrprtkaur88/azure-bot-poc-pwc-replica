param(
  [Parameter(Mandatory = $true)][string]$ResourceGroupName
)

$ErrorActionPreference = "Stop"

$acrName = az acr list -g $ResourceGroupName --query "[0].name" -o tsv
if (-not $acrName) {
  throw "No Azure Container Registry found in $ResourceGroupName."
}

Push-Location .\messaging
try {
  az acr build -r $acrName -t azure-bot:latest -f Dockerfile.bot --target production .
} finally {
  Pop-Location
}
