import type { Logger, LoggerOptions, LogMeta, Sink, LogLevel, LogEntry } from './types.js'
import { LEVEL_VALUE } from './types.js'
import { resolveLevel, shouldLog } from './levels.js'
import { buildPatterns, redactEntry } from './redact.js'
import { consoleSink } from './sinks/console.js'

/**
 * Create a structured logger.
 *
 * - Module name bound once at creation — not repeated per call.
 * - Calls are silenced when the entry level < configured minimum.
 * - Redaction runs before every sink, always on.
 * - The logger never throws; a failing sink is reported to stderr and disabled.
 *
 * @example
 * ```ts
 * import { createLogger } from '@nocturna/logger'
 *
 * const log = createLogger({ module: 'api' })
 *
 * log.info('server listening', { operation: 'boot', data: { port: 8000 } })
 * log.error('DB connection failed', { error: dbError })
 * ```
 */
export function createLogger(options: LoggerOptions): Logger {
  const level = resolveLevel(options.level)
  const redactPatterns = buildPatterns(
    options.redact?.additionalPatterns,
    options.redact?.includeDefaults !== false,
  )

  // Deep-copy sinks array at creation time; disable any that fail during write.
  const activeSinks: Sink[] = [...(options.sinks ?? [consoleSink()])]
  const disabledSinks = new Set<Sink>()

  function write(level: LogLevel, msg: unknown, meta?: LogMeta): void {
    if (!shouldLog(level, resolveLevel(options.level))) return

    const entry = buildEntry(level, options.module, formatMessage(msg), meta)

    // Redact first
    const clean = redactEntry(entry, redactPatterns)

    for (const sink of activeSinks) {
      if (disabledSinks.has(sink)) continue
      try {
        sink.write(clean)
      } catch (err) {
        disabledSinks.add(sink)
        const errMsg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`[logger/${options.module}] sink failed: ${errMsg}\n`)
      }
    }
  }

  const logger: Logger = Object.assign(
    (msg?: unknown, meta?: LogMeta) => write('INFO', msg, meta),
    {
      module: options.module,
      debug:  (msg?: unknown, meta?: LogMeta) => write('DEBUG', msg, meta),
      info:   (msg?: unknown, meta?: LogMeta) => write('INFO', msg, meta),
      warn:   (msg?: unknown, meta?: LogMeta) => write('WARN', msg, meta),
      error:  (msg?: unknown, meta?: LogMeta) => write('ERROR', msg, meta),
      critical: (msg?: unknown, meta?: LogMeta) => write('CRITICAL', msg, meta),
      dispose() {
        for (const sink of activeSinks) {
          try { sink.dispose?.() } catch { /* logger must never throw */ }
        }
      },
    } satisfies Partial<Logger> as Omit<Logger, never>,
  )

  return logger as Logger
}

// ---- Internals ----

function buildEntry(
  level: LogLevel,
  module: string,
  message: string,
  meta?: LogMeta,
): LogEntry {
  return {
    timestamp: getTimestamp(),
    level,
    module,
    message,
    location: getCallerLocation(),
    traceId: meta?.traceId,
    operation: meta?.operation,
    data: meta?.data,
    error: normaliseError(meta?.error),
  }
}

function getTimestamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()} `
    + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

/**
 * Extract caller file:line from the stack trace.
 * Skips the logger's own frames (createLogger internals).
 */
function getCallerLocation(): string | undefined {
  const err = new Error()
  const stack = err.stack
  if (!stack) return undefined

  const lines = stack.split('\n')
  // Skip frames: Error constructor, getCallerLocation, buildEntry, write, and the logger method
  // This is 5–6 frames depending on call depth; scan for the first non-logger frame.
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    if (line.includes('/create-logger.') || line.includes('/redact.')) continue
    const match = line.match(/at\s+(?:.*\s+)?\(([^)]+)\)|at\s+([^\s(]+)/)
    if (match) {
      const raw = match[1] ?? match[2]
      if (!raw) continue
      return raw.replace(/^.*[\\/]/, '').replace(/:\d+$/, '')
    }
  }
  return undefined
}

function formatMessage(msg: unknown): string {
  if (msg === undefined) return ''
  if (msg === null) return 'null'
  if (typeof msg === 'string') return msg
  if (typeof msg === 'number' || typeof msg === 'boolean') return String(msg)
  if (msg instanceof Error) return msg.message
  try { return JSON.stringify(msg) } catch { return String(msg) }
}

function normaliseError(err: unknown): LogEntry['error'] {
  if (!err) return undefined
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: isRecord(err) && typeof err.code === 'string' ? err.code : undefined,
    }
  }
  if (typeof err === 'string') {
    return { name: 'Error', message: err }
  }
  if (isRecord(err)) {
    return {
      name: String(err.name ?? 'Error'),
      message: String(err.message ?? JSON.stringify(err)),
      stack: typeof err.stack === 'string' ? err.stack : undefined,
      code: typeof err.code === 'string' ? err.code : undefined,
    }
  }
  return { name: 'Error', message: String(err) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
