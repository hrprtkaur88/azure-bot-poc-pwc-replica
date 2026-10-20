# azure-bot-poc-pwc-replica

Private deployment replica of the real production "messaging" Azure Bot
(Microsoft 365 Agents SDK) architecture, used to validate the AKS Workload
Identity Federation + `/messaging` path architecture end-to-end and to test
a specific hypothesis about environment variable naming.

## Structure

- `messaging/` — the real application source (unmodified, as provided)
- `infra/` — Bicep: AKS with Workload Identity Federation + OIDC issuer,
  ACR, Azure Bot resource (UserAssignedMSI), federated credential, Key Vault,
  Log Analytics, Application Insights, VNet
- `k8s/` — namespace, ServiceAccount (workload identity annotated),
  ConfigMap, Deployment, Service, Ingress (`/messaging` path, no rewrite)
- `scripts/` — deployment, log collection, and cleanup automation

## Deployment

```powershell
.\scripts\deploy-infra.ps1 -SubscriptionId "<subscription-id>" -Location "westus2" -ResourceGroupName "rg-bot-pwc-replica"
.\scripts\build-and-push-image.ps1 -ResourceGroupName "rg-bot-pwc-replica"
.\scripts\deploy-aks.ps1 -ResourceGroupName "rg-bot-pwc-replica" -PublicBotHost "<host>"
.\scripts\configure-bot.ps1 -ResourceGroupName "rg-bot-pwc-replica" -PublicBotHost "<host>"
```

## Hypothesis test: env var naming gap

`messaging/src/agent.ts` reads `AZURE_BOT_CLIENT_ID` / `AZURE_BOT_TENANT_ID`.
AKS's Azure Workload Identity webhook only injects `AZURE_CLIENT_ID` /
`AZURE_TENANT_ID`. The initial deployment (`k8s/deployment.yaml`) does **not**
set the custom names, to test whether this gap causes a real failure.

If confirmed, apply the fix:

```powershell
.\scripts\apply-client-id-fix.ps1 -ResourceGroupName "rg-bot-pwc-replica"
```

See `docs/findings.md` for the full write-up once testing completes.

## Cleanup

```powershell
.\scripts\cleanup.ps1 -ResourceGroupName "rg-bot-pwc-replica"
```
