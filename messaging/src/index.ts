import express, { type NextFunction, type Request, type Response, Router } from 'express'
import { authorizeJWT } from '@microsoft/agents-hosting'
import { adapter, agentApp, authConfig } from './agent'
import { logger } from './logger'

const app = express()
app.use(express.json())

// Ingress path is /messaging with no rewrite (GitOps backend chart).
// The app therefore serves all routes under that prefix.
const router = Router()

// Debug request log for the messaging endpoint (skips /healthz probe noise).
// Logs on response finish so it captures 401s from authorizeJWT too.
router.use('/api/messages', (req: Request, res: Response, next: NextFunction) => {
  if (!logger.isLevelEnabled('debug')) return next()
  const startedAt = Date.now()
  logger.debug('Request received', {
    method: req.method,
    path: req.originalUrl,
    contentLength: req.get('content-length'),
    hasAuthorization: Boolean(req.get('authorization')),
    userAgent: req.get('user-agent'),
  })
  res.on('finish', () => {
    logger.debug('Request completed', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    })
  })
  next()
})

// Liveness/readiness probe for AKS — registered before JWT middleware so probes
// are never rejected for lacking a Bot Framework token.
router.get('/healthz', (_req: Request, res: Response) => {
  logger.info('Health check')
  res.status(200).json({ status: 'ok' })
})

// Validate the inbound Bot Framework bearer JWT and populate req.user (incl. aud).
// CloudAdapter only acquires an outbound connector token when identity.aud is set;
// without this middleware, sendActivity posts anonymously and Bot Framework returns 401.
router.use('/api/messages', authorizeJWT(authConfig))

// Reached only when the inbound JWT verified. Logs non-secret claims that
// matter for debugging audience/issuer mismatches.
router.use('/api/messages', (req: Request, _res: Response, next: NextFunction) => {
  const user = (req as Request & { user?: Record<string, unknown> }).user
  logger.debug('Inbound JWT verified', {
    aud: user?.aud,
    iss: user?.iss,
    appid: user?.appid ?? user?.azp,
    serviceUrl: user?.serviceurl,
  })
  next()
})

// Azure Bot Service POSTs activities here. Set this URL as the bot's
// "Messaging endpoint": https://<host>/messaging/api/messages
router.post('/api/messages', async (req: Request, res: Response) => {
  const activity = req.body as {
    type?: string
    id?: string
    channelId?: string
    conversation?: { id?: string }
    from?: { id?: string }
    text?: string
  }

  logger.info('Incoming activity', {
    activityType: activity?.type,
    activityId: activity?.id,
    channelId: activity?.channelId,
    conversationId: activity?.conversation?.id,
    fromId: activity?.from?.id,
    textLength: typeof activity?.text === 'string' ? activity.text.length : 0,
  })

  try {
    await adapter.process(req, res, async (context) => {
      await agentApp.run(context)
    })
  } catch (error) {
    const err = error as Error
    logger.error('Failed to process activity', {
      activityType: activity?.type,
      activityId: activity?.id,
      conversationId: activity?.conversation?.id,
      error: err?.message,
      stack: err?.stack,
    })
    if (!res.headersSent) {
      res.status(500).json({ status: 'error' })
    }
  }
})

app.use('/messaging', router)

const port = Number(process.env.PORT) || 3978
app.listen(port, '0.0.0.0', () => {
  logger.info('azure-bot listening', {
    port,
    basePath: '/messaging',
    logLevel: logger.level,
    sdkDebug: process.env.DEBUG ?? null,
  })
})
