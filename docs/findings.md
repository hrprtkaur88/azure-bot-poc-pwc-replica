# Findings: Real `messaging` app — env var naming gap confirmed

## Summary

**Confirmed and fixed.** The real production application (`messaging/`) crash-loops
on startup when deployed to AKS with only the standard Azure Workload Identity
Federation environment variables present. Applying one additional pair of
environment variables resolves it, and the full end-to-end Bot Framework reply
path (inbound JWT validation → activity processing → outbound reply) then works
correctly, as proven via Direct Line.

## Phase 1 — reproduction (unmodified app code, no extra env vars)

Deployment: AKS with Workload Identity Federation enabled, ServiceAccount
annotated with `azure.workload.identity/client-id` / `tenant-id`, pod labeled
`azure.workload.identity/use: "true"`. `ENABLE_AZURE_BOT_FEDERATED_IDENTITY=true`
set via ConfigMap. No `AZURE_BOT_CLIENT_ID` / `AZURE_BOT_TENANT_ID` set.

**Result:** Pod enters `CrashLoopBackOff` immediately on every restart:

```
Error: ClientId required in production
    at applyDefaultSettings (/home/node/app/node_modules/@microsoft/agents-hosting/dist/src/auth/settings.js:44:15)
    at getAuthConfigWithDefaults (/home/node/app/node_modules/@microsoft/agents-hosting/dist/src/auth/authConfiguration.js:386:58)
    at buildAuthConfig (/home/node/app/dist/agent.js:16:63)
```

**Root cause:** AKS's Azure Workload Identity mutating webhook injects fixed,
non-configurable environment variable names: `AZURE_CLIENT_ID`,
`AZURE_TENANT_ID`, `AZURE_FEDERATED_TOKEN_FILE`, `AZURE_AUTHORITY_HOST`.
`messaging/src/agent.ts`'s `buildAuthConfig()` reads custom names instead:
`AZURE_BOT_CLIENT_ID`, `AZURE_BOT_TENANT_ID` (confirmed in `README.md`'s
configuration table — these are deliberate, documented custom names, not a
typo). Only `AZURE_FEDERATED_TOKEN_FILE` happens to match by coincidence.
With `NODE_ENV=production` (set by `Dockerfile.bot`), `getAuthConfigWithDefaults()`
enforces that `clientId` must be present and throws synchronously at module
load time — before the Express server ever starts listening.

## Phase 2 — fix and validation

Applied fix: set `AZURE_BOT_CLIENT_ID` and `AZURE_BOT_TENANT_ID` as explicit
pod environment variables, with literal values equal to the user-assigned
managed identity's `clientId` and the tenant ID (the same values AKS's webhook
separately injects as `AZURE_CLIENT_ID` / `AZURE_TENANT_ID`).

```powershell
.\scripts\apply-client-id-fix.ps1 -ResourceGroupName rg-bot-pwc-replica
```

**Result:** Pod starts cleanly:

```
agents:authorization:connections:debug connection "serviceConnection" clientId=<...> tenantId=<...> authType=WorkloadIdentity
{"message":"azure-bot listening","port":3978,"basePath":"/messaging", ...}
```

End-to-end test via Direct Line (same architecture as the diagram — Azure Bot
Service → AKS ingress `/messaging` → `authorizeJWT` → `CloudAdapter` →
`AgentApplication`):

- Inbound JWT verified (`aud` matches the bot's app ID, `iss` is Bot Framework)
- `membersAdded` → "Hello! How can I help you?" reply sent successfully
- `message` → echo reply sent successfully: `"You said: ..."`

All replies succeeded with no 401/500 errors.

## Recommended permanent fix (not applied to source in this exercise)

One of:
1. Update `messaging/src/agent.ts`'s `buildAuthConfig()` to fall back to
   `env.AZURE_CLIENT_ID` / `env.AZURE_TENANT_ID` when `AZURE_BOT_CLIENT_ID` /
   `AZURE_BOT_TENANT_ID` are unset, so the AKS-injected names work without any
   extra manifest changes.
2. Keep the custom names, but ensure the GitOps Helm chart / Kubernetes
   Deployment manifest explicitly sets `AZURE_BOT_CLIENT_ID` /
   `AZURE_BOT_TENANT_ID` (e.g., from the same Bicep/Terraform output used for
   the workload identity's `clientId`/`tenantId`), exactly as done manually
   here via `apply-client-id-fix.ps1`.

Either approach prevents a production crash-loop that would otherwise be
difficult to diagnose without the exact Node.js startup stack trace captured
here, since it occurs before the health endpoint and before any HTTP traffic
is even accepted.
