export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogMeta = Record<string, unknown>

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const DEFAULT_LEVEL: LogLevel = 'info'

/** Parse LOG_LEVEL (case-insensitive). Unknown or empty values fall back to info. */
export function parseLogLevel(value: string | undefined): LogLevel {
  const normalized = value?.trim().toLowerCase()
  return normalized && normalized in LEVEL_RANK ? (normalized as LogLevel) : DEFAULT_LEVEL
}

export interface Logger {
  readonly level: LogLevel
  isLevelEnabled(level: LogLevel): boolean
  debug(message: string, meta?: LogMeta): void
  info(message: string, meta?: LogMeta): void
  warn(message: string, meta?: LogMeta): void
  error(message: string, meta?: LogMeta): void
}

export function createLogger(
  level: LogLevel = DEFAULT_LEVEL,
  out: (line: string) => void = (line) => process.stdout.write(line),
): Logger {
  const isLevelEnabled = (candidate: LogLevel) => LEVEL_RANK[candidate] >= LEVEL_RANK[level]

  const write = (entryLevel: LogLevel, message: string, meta?: LogMeta) => {
    if (!isLevelEnabled(entryLevel)) return
    out(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: entryLevel,
        service: 'azure-bot',
        message,
        ...meta,
      })}\n`,
    )
  }

  return {
    level,
    isLevelEnabled,
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  }
}

export const logger: Logger = createLogger(parseLogLevel(process.env.LOG_LEVEL))
