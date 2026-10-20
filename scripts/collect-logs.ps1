param(
  [Parameter(Mandatory = $true)][string]$ResourceGroupName,
  [string]$OutputPath = ".\_outputs\logs"
)

$ErrorActionPreference = "Continue"

$aksName = az aks list -g $ResourceGroupName --query "[0].name" -o tsv
az aks get-credentials -g $ResourceGroupName -n $aksName --overwrite-existing

New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null

kubectl get pods -n azure-bot -o wide | Tee-Object "$OutputPath\pods.txt"
kubectl get events -n azure-bot --sort-by=.lastTimestamp | Tee-Object "$OutputPath\events.txt"
kubectl describe deployment azure-bot -n azure-bot | Tee-Object "$OutputPath\deployment-describe.txt"

$pods = kubectl get pods -n azure-bot -l app=azure-bot -o jsonpath="{.items[*].metadata.name}"
foreach ($pod in $pods.Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)) {
  kubectl logs $pod -n azure-bot --timestamps | Tee-Object "$OutputPath\$pod.log"
  kubectl logs $pod -n azure-bot --previous --timestamps 2>$null | Tee-Object "$OutputPath\$pod.previous.log"
}

Write-Output "Logs written to $OutputPath"
