import assert from 'node:assert/strict'
import test from 'node:test'

import { AuthType } from '@microsoft/agents-hosting'

import { buildAuthConfig } from '../src/agent'

test('configures client secret authentication', () => {
  const authConfig = buildAuthConfig({
    AZURE_BOT_CLIENT_ID: 'bot-app-client-id',
    AZURE_BOT_TENANT_ID: 'tenant-id',
    AZURE_BOT_CLIENT_SECRET: 'bot-app-client-secret',
  })

  assert.equal(authConfig.authType, AuthType.ClientSecret)
  assert.equal(authConfig.clientId, 'bot-app-client-id')
  assert.equal(authConfig.clientSecret, 'bot-app-client-secret')
  assert.equal(authConfig.tenantId, 'tenant-id')
  assert.equal(authConfig.federatedTokenFile, undefined)
  assert.deepEqual(authConfig.scopes, ['https://api.botframework.com'])

  // authorizeJWT matches inbound JWT aud against a connection's clientId.
  const connection = [...(authConfig.connections?.values() ?? [])].find(
    (entry) => entry.clientId === 'bot-app-client-id',
  )
  assert.ok(connection, 'expected a connection whose clientId matches the bot app id')
  assert.equal(connection?.authType, AuthType.ClientSecret)
  assert.equal(connection?.clientSecret, 'bot-app-client-secret')
})

test('requires AZURE_BOT_CLIENT_SECRET when federated identity is off', () => {
  assert.throws(
    () =>
      buildAuthConfig({
        AZURE_BOT_CLIENT_ID: 'bot-app-client-id',
        AZURE_BOT_TENANT_ID: 'tenant-id',
      }),
    /AZURE_BOT_CLIENT_SECRET/,
  )
})

test('flag off ignores federated token file and uses client secret', () => {
  const authConfig = buildAuthConfig({
    AZURE_BOT_CLIENT_ID: 'bot-app-client-id',
    AZURE_BOT_TENANT_ID: 'tenant-id',
    AZURE_BOT_CLIENT_SECRET: 'bot-app-client-secret',
    AZURE_FEDERATED_TOKEN_FILE:
      '/var/run/secrets/azure/tokens/azure-identity-token',
  })

  assert.equal(authConfig.authType, AuthType.ClientSecret)
  assert.equal(authConfig.clientSecret, 'bot-app-client-secret')
  assert.equal(authConfig.federatedTokenFile, undefined)
})

test('configures workload identity when federated identity flag is on', () => {
  const authConfig = buildAuthConfig({
    ENABLE_AZURE_BOT_FEDERATED_IDENTITY: 'true',
    AZURE_BOT_CLIENT_ID: 'managed-identity-client-id',
    AZURE_BOT_TENANT_ID: 'tenant-id',
    AZURE_FEDERATED_TOKEN_FILE:
      '/var/run/secrets/azure/tokens/azure-identity-token',
    // Present but ignored when the flag is on.
    AZURE_BOT_CLIENT_SECRET: 'bot-app-client-secret',
  })

  assert.equal(authConfig.authType, AuthType.WorkloadIdentity)
  assert.equal(authConfig.clientId, 'managed-identity-client-id')
  assert.equal(authConfig.tenantId, 'tenant-id')
  assert.equal(
    authConfig.federatedTokenFile,
    '/var/run/secrets/azure/tokens/azure-identity-token',
  )
  assert.equal(authConfig.clientSecret, undefined)
  assert.deepEqual(authConfig.scopes, ['https://api.botframework.com'])

  const connection = [...(authConfig.connections?.values() ?? [])].find(
    (entry) => entry.clientId === 'managed-identity-client-id',
  )
  assert.ok(connection, 'expected a connection whose clientId matches the bot app id')
  assert.equal(connection?.authType, AuthType.WorkloadIdentity)
  assert.equal(
    connection?.federatedTokenFile,
    '/var/run/secrets/azure/tokens/azure-identity-token',
  )
  assert.equal(connection?.clientSecret, undefined)
})

test('requires AZURE_FEDERATED_TOKEN_FILE when federated identity flag is on', () => {
  assert.throws(
    () =>
      buildAuthConfig({
        ENABLE_AZURE_BOT_FEDERATED_IDENTITY: 'true',
        AZURE_BOT_CLIENT_ID: 'managed-identity-client-id',
        AZURE_BOT_TENANT_ID: 'tenant-id',
      }),
    /AZURE_FEDERATED_TOKEN_FILE/,
  )
})
