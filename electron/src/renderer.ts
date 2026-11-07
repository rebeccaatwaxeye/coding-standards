/**
 * Renderer-side logger — forwards all output to the main process over IPC.
 *
 * In the renderer process there is no filesystem. All log output is sent
 * to the main process where it lands in the same file as main-process logs.
 *
 * @example
 * ```ts
 * import { createRendererLogger } from '@nocturna/logger-electron'
 *
 * const log = createRendererLogger('renderer/api')
 * log.info('request sent', { operation: 'fetchData' })
 * ```
 */

import type { Logger, LogLevel, LogMeta } from '@nocturna/logger'
import { resolveLevel, shouldLog } from '@nocturna/logger'

declare global {
	interface Window {
		__nocturnaLog?: (
			level: string,
			module: string,
			message: string,
			meta?: Record<string, unknown>,
		) => void
	}
}

/**
 * Create a renderer-side logger that forwards to the main process.
 *
 * Falls back to `console[level](...)` if the preload bridge is not available
 * (e.g. during development before preload is loaded).
 */
export function createRendererLogger(moduleName: string, level?: LogLevel): Logger {
	const effectiveLevel = resolveLevel(level)
	const send = window.__nocturnaLog

	function write(lvl: LogLevel, msg: unknown, meta?: LogMeta): void {
		if (!shouldLog(lvl, effectiveLevel)) return
		const message = formatMessage(msg)
		const payload: Record<string, unknown> = {}
		if (meta?.traceId) payload.traceId = meta.traceId
		if (meta?.operation) payload.operation = meta.operation
		if (meta?.data !== undefined) payload.data = meta.data
		if (meta?.error !== undefined) payload.error = normaliseError(meta.error)

		if (send) {
			send(lvl, moduleName, message, payload)
		} else {
			// Fallback — preload bridge not yet available
			const consoleFn = getConsoleFn(lvl)
			consoleFn(`[${moduleName}] [${lvl}] ${message}`, payload)
		}
	}

	const logger: Logger = Object.assign(
		(msg?: unknown, meta?: LogMeta) => write('INFO', msg, meta),
		{
			module: moduleName,
			debug: (msg?: unknown, meta?: LogMeta) => write('DEBUG', msg, meta),
			info: (msg?: unknown, meta?: LogMeta) => write('INFO', msg, meta),
			warn: (msg?: unknown, meta?: LogMeta) => write('WARN', msg, meta),
			error: (msg?: unknown, meta?: LogMeta) => write('ERROR', msg, meta),
			critical: (msg?: unknown, meta?: LogMeta) => write('CRITICAL', msg, meta),
			dispose() {
				/* no-op — no resources to clean up in renderer */
			},
		} satisfies Partial<Logger> as Omit<Logger, never>,
	)

	return logger as Logger
}

// ---- Internals ----

function getConsoleFn(level: string): typeof console.info {
	switch (level) {
		case 'CRITICAL':
		case 'ERROR':
			return console.error
		case 'WARN':
			return console.warn
		case 'DEBUG':
			return console.debug
		default:
			return console.info
	}
}

function formatMessage(msg: unknown): string {
	if (msg === undefined) return ''
	if (msg === null) return 'null'
	if (typeof msg === 'string') return msg
	if (typeof msg === 'number' || typeof msg === 'boolean') return String(msg)
	if (msg instanceof Error) return msg.message
	try {
		return JSON.stringify(msg)
	} catch {
		return String(msg)
	}
}

function normaliseError(err: unknown): Record<string, unknown> | undefined {
	if (!err) return undefined
	if (err instanceof Error) {
		return { name: err.name, message: err.message, stack: err.stack }
	}
	if (typeof err === 'string') return { name: 'Error', message: err }
	return { name: 'Error', message: String(err) }
}
