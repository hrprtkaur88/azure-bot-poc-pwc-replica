param(
  [Parameter(Mandatory = $true)][string]$ResourceGroupName,
  [string]$PublicBotHost = "",
  [string]$TenantId = ""
)

$ErrorActionPreference = "Stop"

$aksName = az aks list -g $ResourceGroupName --query "[0].name" -o tsv
$acrLoginServer = az acr list -g $ResourceGroupName --query "[0].loginServer" -o tsv
$identityClientId = az identity list -g $ResourceGroupName --query "[0].clientId" -o tsv
if (-not $TenantId) {
  $TenantId = az account show --query tenantId -o tsv
}

az aks get-credentials -g $ResourceGroupName -n $aksName --overwrite-existing

$work = New-Item -ItemType Directory -Force -Path ".\_outputs\k8s" | Select-Object -ExpandProperty FullName
Copy-Item ".\k8s\*.yaml" $work -Force

$files = Get-ChildItem $work -Filter "*.yaml"
foreach ($file in $files) {
  $content = Get-Content $file.FullName -Raw
  $content = $content.Replace("<acr-login-server>", $acrLoginServer)
  $content = $content.Replace("<tenant-id>", $TenantId)
  $content = $content.Replace("<managed-identity-client-id>", $identityClientId)
  $content = $content.Replace("<public-bot-host>", $PublicBotHost)
  Set-Content -Path $file.FullName -Value $content -NoNewline
}

kubectl apply -f "$work\namespace.yaml"
kubectl apply -f "$work\configmap.yaml"
kubectl apply -f "$work\service-account.yaml"
kubectl create secret generic azure-bot-secrets `
  -n azure-bot `
  --from-literal=APPLICATIONINSIGHTS_CONNECTION_STRING="$(az monitor app-insights component show -g $ResourceGroupName --query connectionString -o tsv)" `
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f "$work\deployment.yaml"
kubectl apply -f "$work\service.yaml"
if ($PublicBotHost) {
  kubectl apply -f "$work\ingress.yaml"
}

kubectl rollout status deployment/azure-bot -n azure-bot --timeout=180s
kubectl get all -n azure-bot
