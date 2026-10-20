# azure-bot

Azure Bot Service messaging endpoint for Conversation Intelligence, built on the
[Microsoft 365 Agents SDK](https://learn.microsoft.com/microsoft-365/agents-sdk/)
(`@microsoft/agents-hosting`).

It exposes `POST /messaging/api/messages` — the endpoint the Bot Framework
Service POSTs activities to. The `/messaging` prefix matches the GitOps ingress
path (no rewrite). Today it's an **echo scaffold**: it greets on join and echoes
any message back, which is enough to make Web Chat connect and to clear the
"messaging endpoint has not been configured" error. Real routing (e.g. proxy to
the CI backend) is a follow-up.

## Why this exists

Azure Bot Service needs a reachable HTTPS endpoint to deliver messages. Until one
is deployed and set as the bot's **Messaging endpoint**, Web Chat reports:

> It appears that the messaging endpoint for this bot has not been configured yet.

## Configuration

Outbound Bot Framework replies use the bot app registration. Auth mode is
selected by `ENABLE_AZURE_BOT_FEDERATED_IDENTITY` (default off = client secret):

| Var | Meaning |
| --- | --- |
| `AZURE_BOT_CLIENT_ID` | Bot Microsoft App ID (or user-assigned managed identity client ID for workload identity) |
| `AZURE_BOT_TENANT_ID` | Directory (tenant) ID |
| `AZURE_BOT_CLIENT_SECRET` | Client secret for the bot app registration (required when federated identity is off) |
| `ENABLE_AZURE_BOT_FEDERATED_IDENTITY` | Set to `true` to use AKS workload identity instead of client secret |
| `AZURE_FEDERATED_TOKEN_FILE` | Path to the projected federated token file (required when the flag is `true`) |
| `PORT` | Listen port (default `3978`) |
| `LOG_LEVEL` | App log level: `debug`, `info` (default), `warn`, `error` |
| `DEBUG` | Agents SDK debug namespaces, e.g. `agents:*` (unset = SDK silent) |

`agent.ts` builds Agents SDK auth from those env vars:

- **Default / local:** `AuthType.ClientSecret` via `AZURE_BOT_CLIENT_SECRET`.
- **AKS (flag on):** `AuthType.WorkloadIdentity` via `AZURE_FEDERATED_TOKEN_FILE`
  (typical path `/var/run/secrets/azure/tokens/azure-identity-token`). When the
  flag is on, `AZURE_BOT_CLIENT_SECRET` is ignored.

The same configuration validates inbound Bot Framework JWTs (`authorizeJWT`)
and signs outbound replies (`CloudAdapter`).

`authorizeJWT` is required for replies: `CloudAdapter` only fetches a Bot
Framework connector token when `request.user.aud` is set from the verified JWT.
Without it, `sendActivity` goes out unauthenticated and the connector returns 401.

## Debug logging

Two independent switches, both env-only (no rebuild needed once the image has
the `LOG_LEVEL` support):

- **`LOG_LEVEL=debug`** — app logs (JSON on stdout). Adds request
  received/completed (status, duration, whether an `Authorization` header was
  present), verified inbound JWT claims (`aud`, `iss`, `appid`, `serviceUrl`),
  the auth config summary at startup (auth type, client/tenant ID, federated
  token file presence/size/mtime), and outbound reply timing/failures.
  Secrets and token contents are never logged.
- **`DEBUG=agents:*`** — Agents SDK logs via the `debug` package (plain text on
  stderr), namespaced `agents:<component>:<level>`. Narrow it when you only care
  about auth, e.g.
  `DEBUG=agents:msal:*,agents:jwt-middleware:*,agents:cloud-adapter:*`.
  Note `agents:jwt-middleware:debug` logs decoded inbound JWT claims.

Turn both off (unset) once you are done debugging a shared environment.

## Local development

```bash
cd messaging
npm install
cp .env.example .env
npm run start:dev
```

Leave `ENABLE_AZURE_BOT_FEDERATED_IDENTITY` unset or `false` locally. Set
`AZURE_BOT_CLIENT_ID`, `AZURE_BOT_TENANT_ID`, and `AZURE_BOT_CLIENT_SECRET` to
the bot's Microsoft App registration. Local startup supports health and
unauthenticated-route checks; authenticated Bot Framework replies require the
client secret.

Sanity checks:

```bash
curl localhost:3978/messaging/healthz             # -> 200 {"status":"ok"}
curl -XPOST localhost:3978/messaging/api/messages # -> 401 (authorizeJWT rejects tokenless calls)
```

## Container build

Multi-stage, mirroring the repo's Node backend Dockerfiles.

```bash
# Local base image
docker build -f Dockerfile.bot --target production -t azure-bot .

# PwC JFrog base (CI/CD)
docker build -f Dockerfile.bot.jfrog --target production -t azure-bot .
```

Place corporate root certs in `certificates/` before building (see
`certificates/README.md`).

## Deploy

1. Deploy the container to AKS and expose it over HTTPS through the ingress.
2. In the Azure portal → your Bot resource → **Configuration**, set
   **Messaging endpoint** to:

   ```
   https://<aks-ingress-host>/messaging/api/messages
   ```

3. Open **Test in Web Chat**, send a message, and confirm the echo reply.
