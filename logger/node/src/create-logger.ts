import { resolveLevel, shouldLog } from './levels.js'
import { formatMessage, normaliseError } from './message.js'
import { buildPatterns, redactEntry } from './redact.js'
import { consoleSink } from './sinks/console.js'
import type { LogEntry, Logger, LoggerOptions, LogLevel, LogMeta, Sink } from './types.js'

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
	const _level = resolveLevel(options.level)
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
			debug: (msg?: unknown, meta?: LogMeta) => write('DEBUG', msg, meta),
			info: (msg?: unknown, meta?: LogMeta) => write('INFO', msg, meta),
			warn: (msg?: unknown, meta?: LogMeta) => write('WARN', msg, meta),
			error: (msg?: unknown, meta?: LogMeta) => write('ERROR', msg, meta),
			critical: (msg?: unknown, meta?: LogMeta) => write('CRITICAL', msg, meta),
			dispose() {
				for (const sink of activeSinks) {
					try {
						sink.dispose?.()
					} catch {
						/* logger must never throw */
					}
				}
			},
		} satisfies Partial<Logger> as Omit<Logger, never>,
	)

	return logger as Logger
}

// ---- Internals ----

function buildEntry(level: LogLevel, module: string, message: string, meta?: LogMeta): LogEntry {
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
	return (
		`${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()} ` +
		`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
	)
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
