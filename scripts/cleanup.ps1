param(
  [Parameter(Mandatory = $true)][string]$ResourceGroupName,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

if (-not $Yes) {
  $confirmation = Read-Host "Delete resource group '$ResourceGroupName' and all resources? Type DELETE to continue"
  if ($confirmation -ne "DELETE") {
    Write-Output "Cleanup cancelled."
    exit 0
  }
}

az group delete -n $ResourceGroupName --yes --no-wait
Write-Output "Deletion started for $ResourceGroupName."
