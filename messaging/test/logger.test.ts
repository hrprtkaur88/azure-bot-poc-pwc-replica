import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { buildAuthConfig, describeAuthConfig } from '../src/agent'
import { createLogger, parseLogLevel } from '../src/logger'

function capture(level: Parameters<typeof createLogger>[0]) {
  const lines: Record<string, unknown>[] = []
  const logger = createLogger(level, (line) => lines.push(JSON.parse(line)))
  return { logger, lines }
}

test('parseLogLevel accepts known levels case-insensitively', () => {
  assert.equal(parseLogLevel('DEBUG'), 'debug')
  assert.equal(parseLogLevel(' warn '), 'warn')
  assert.equal(parseLogLevel('error'), 'error')
})

test('parseLogLevel falls back to info for missing or unknown values', () => {
  assert.equal(parseLogLevel(undefined), 'info')
  assert.equal(parseLogLevel(''), 'info')
  assert.equal(parseLogLevel('verbose'), 'info')
})

test('default info level suppresses debug', () => {
  const { logger, lines } = capture('info')
  logger.debug('hidden')
  logger.info('shown', { a: 1 })
  assert.equal(logger.isLevelEnabled('debug'), false)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].level, 'info')
  assert.equal(lines[0].message, 'shown')
  assert.equal(lines[0].a, 1)
  assert.equal(lines[0].service, 'azure-bot')
})

test('debug level emits debug and above', () => {
  const { logger, lines } = capture('debug')
  logger.debug('d')
  logger.info('i')
  logger.warn('w')
  logger.error('e')
  assert.deepEqual(
    lines.map((line) => line.level),
    ['debug', 'info', 'warn', 'error'],
  )
})

test('error level suppresses everything below error', () => {
  const { logger, lines } = capture('error')
  logger.info('i')
  logger.warn('w')
  logger.error('e')
  assert.deepEqual(
    lines.map((line) => line.level),
    ['error'],
  )
})

test('describeAuthConfig never exposes the client secret', () => {
  const summary = describeAuthConfig(
    buildAuthConfig({
      AZURE_BOT_CLIENT_ID: 'bot-app-client-id',
      AZURE_BOT_TENANT_ID: 'tenant-id',
      AZURE_BOT_CLIENT_SECRET: 'super-secret-value',
    }),
  )
  assert.equal(summary.hasClientSecret, true)
  assert.equal(summary.clientId, 'bot-app-client-id')
  assert.ok(!JSON.stringify(summary).includes('super-secret-value'))
})

test('describeAuthConfig reports federated token file status', () => {
  const dir = mkdtempSync(join(tmpdir(), 'messaging-test-'))
  const tokenFile = join(dir, 'token')
  writeFileSync(tokenFile, 'not-a-real-token')

  const present = describeAuthConfig(
    buildAuthConfig({
      ENABLE_AZURE_BOT_FEDERATED_IDENTITY: 'true',
      AZURE_BOT_CLIENT_ID: 'mi-client-id',
      AZURE_BOT_TENANT_ID: 'tenant-id',
      AZURE_FEDERATED_TOKEN_FILE: tokenFile,
    }),
  )
  assert.equal(present.federatedTokenFileExists, true)
  assert.equal(present.federatedTokenFileBytes, 'not-a-real-token'.length)
  assert.ok(!JSON.stringify(present).includes('not-a-real-token'))

  const missing = describeAuthConfig(
    buildAuthConfig({
      ENABLE_AZURE_BOT_FEDERATED_IDENTITY: 'true',
      AZURE_BOT_CLIENT_ID: 'mi-client-id',
      AZURE_BOT_TENANT_ID: 'tenant-id',
      AZURE_FEDERATED_TOKEN_FILE: join(dir, 'does-not-exist'),
    }),
  )
  assert.equal(missing.federatedTokenFileExists, false)
  assert.equal(missing.federatedTokenFileError, 'ENOENT')
})
