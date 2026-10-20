param(
  [Parameter(Mandatory = $true)][string]$ResourceGroupName,
  [string]$TenantId = ""
)

$ErrorActionPreference = "Stop"

# This is the fix for the env-var naming gap identified by analysis:
# src/agent.ts reads AZURE_BOT_CLIENT_ID / AZURE_BOT_TENANT_ID, but AKS's
# Workload Identity webhook only injects AZURE_CLIENT_ID / AZURE_TENANT_ID.
# Without this, buildAuthConfig() receives undefined clientId/tenantId.
$identityClientId = az identity list -g $ResourceGroupName --query "[0].clientId" -o tsv
if (-not $TenantId) {
  $TenantId = az account show --query tenantId -o tsv
}

kubectl set env deployment/azure-bot -n azure-bot `
  AZURE_BOT_CLIENT_ID=$identityClientId `
  AZURE_BOT_TENANT_ID=$TenantId

kubectl rollout status deployment/azure-bot -n azure-bot --timeout=180s
kubectl get pods -n azure-bot -o wide

Write-Output "Applied fix: AZURE_BOT_CLIENT_ID=$identityClientId AZURE_BOT_TENANT_ID=$TenantId"
