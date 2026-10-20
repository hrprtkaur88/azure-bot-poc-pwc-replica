import {
  AgentApplication,
  AuthType,
  CloudAdapter,
  getAuthConfigWithDefaults,
  MemoryStorage,
} from '@microsoft/agents-hosting'
import type {
  AuthConfiguration,
  TurnContext,
  TurnState,
} from '@microsoft/agents-hosting'

import { statSync } from 'node:fs'

import { logger } from './logger'

export function buildAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): AuthConfiguration {
  const useFederatedIdentity = env.ENABLE_AZURE_BOT_FEDERATED_IDENTITY === 'true'

  if (useFederatedIdentity) {
    const federatedTokenFile = env.AZURE_FEDERATED_TOKEN_FILE
    if (!federatedTokenFile) {
      throw new Error(
        'Set AZURE_FEDERATED_TOKEN_FILE when ENABLE_AZURE_BOT_FEDERATED_IDENTITY=true.',
      )
    }

    return getAuthConfigWithDefaults({
      authType: AuthType.WorkloadIdentity,
      clientId: env.AZURE_BOT_CLIENT_ID,
      tenantId: env.AZURE_BOT_TENANT_ID,
      federatedTokenFile,
      scopes: ['https://api.botframework.com'],
    })
  }

  const clientSecret = env.AZURE_BOT_CLIENT_SECRET

  if (!clientSecret) {
    throw new Error('Set AZURE_BOT_CLIENT_SECRET for bot app-registration auth.')
  }

  return getAuthConfigWithDefaults({
    authType: AuthType.ClientSecret,
    clientId: env.AZURE_BOT_CLIENT_ID,
    clientSecret,
    tenantId: env.AZURE_BOT_TENANT_ID,
    scopes: ['https://api.botframework.com'],
  })
}

/**
 * Non-secret summary of the auth config for debug logging. Never includes the
 * client secret or token contents — only whether they are present.
 */
export function describeAuthConfig(config: AuthConfiguration): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    authType: config.authType,
    clientId: config.clientId,
    tenantId: config.tenantId,
    scopes: config.scopes,
    hasClientSecret: Boolean(config.clientSecret),
    connectionCount: config.connections?.size ?? 0,
  }

  if (config.federatedTokenFile) {
    summary.federatedTokenFile = config.federatedTokenFile
    try {
      const stat = statSync(config.federatedTokenFile)
      summary.federatedTokenFileExists = true
      summary.federatedTokenFileBytes = stat.size
      summary.federatedTokenFileModifiedAt = stat.mtime.toISOString()
    } catch (error) {
      summary.federatedTokenFileExists = false
      summary.federatedTokenFileError = (error as NodeJS.ErrnoException).code ?? String(error)
    }
  }

  return summary
}

export const authConfig: AuthConfiguration = buildAuthConfig()

logger.debug('Auth config built', describeAuthConfig(authConfig))

export const adapter = new CloudAdapter(authConfig)

export const agentApp = new AgentApplication<TurnState>({
  storage: new MemoryStorage(),
  adapter,
})

function activityMeta(context: TurnContext) {
  const { activity } = context
  return {
    activityType: activity.type,
    activityId: activity.id,
    channelId: activity.channelId,
    conversationId: activity.conversation?.id,
    fromId: activity.from?.id,
    textLength: typeof activity.text === 'string' ? activity.text.length : 0,
  }
}

// Send a reply with debug timing around the outbound Bot Framework call, which
// is where connector-token (MSAL / workload identity) failures surface.
async function sendReply(context: TurnContext, text: string): Promise<void> {
  const meta = {
    ...activityMeta(context),
    serviceUrl: context.activity.serviceUrl,
    replyLength: text.length,
  }
  const startedAt = Date.now()
  logger.debug('Sending reply', meta)
  try {
    const response = await context.sendActivity(text)
    logger.debug('Reply sent', {
      ...meta,
      replyActivityId: response?.id,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    const err = error as Error & { statusCode?: number; status?: number }
    logger.error('Reply failed', {
      ...meta,
      durationMs: Date.now() - startedAt,
      statusCode: err?.statusCode ?? err?.status,
      error: err?.message,
      stack: err?.stack,
    })
    throw error
  }
}

// Greet each member added to the conversation (fires when Web Chat opens).
agentApp.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  logger.info('Handling membersAdded', activityMeta(context))
  logger.debug('membersAdded detail', {
    activityId: context.activity.id,
    membersAdded: context.activity.membersAdded?.map((member) => member.id),
    recipientId: context.activity.recipient?.id,
  })
  await sendReply(context, 'Hello! How can I help you?')
})

// Echo scaffold — proves the messaging endpoint, auth, and reply path work
// end-to-end. Replace with real logic (e.g. proxy to the CI backend) later.
agentApp.onActivity('message', async (context: TurnContext, _state: TurnState) => {
  logger.info('Handling message activity', activityMeta(context))
  await sendReply(context, `You said: ${context.activity.text}`)
})
