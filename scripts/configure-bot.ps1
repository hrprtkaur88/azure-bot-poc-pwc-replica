param(
  [Parameter(Mandatory = $true)][string]$ResourceGroupName,
  [Parameter(Mandatory = $true)][string]$PublicBotHost
)

$ErrorActionPreference = "Stop"

$botName = az resource list -g $ResourceGroupName --resource-type Microsoft.BotService/botServices --query "[0].name" -o tsv
if (-not $botName) {
  throw "No Azure Bot resource found in $ResourceGroupName."
}

# Matches the architecture diagram: ingress path /messaging (no rewrite).
$endpoint = "https://$PublicBotHost/messaging/api/messages"
az bot update -g $ResourceGroupName -n $botName --endpoint $endpoint
az bot msteams create -g $ResourceGroupName -n $botName

Write-Output "Bot endpoint: $endpoint"
Write-Output "Teams channel configured for bot: $botName"
