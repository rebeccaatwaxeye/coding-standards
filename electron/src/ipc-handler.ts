/**
 * Main-process IPC handler — receives log entries from the renderer
 * and writes them through the main process logger (file sink + console).
 *
 * Register in your main.ts:
 * ```ts
 * import { createLogger, consoleSink } from '@nocturna/logger'
 * import { createIpcLogHandler, electronFileSink } from '@nocturna/logger-electron'
 *
 * // Sinks are shared between main and renderer loggers so all output
 * // lands in the same file.
 * const sinks = [consoleSink(), electronFileSink()]
 *
 * createIpcLogHandler((module) => createLogger({ module, sinks }))
 * ```
 *
 * A factory is used (rather than a single logger instance) so each renderer
 * module keeps its own name. Without this, every renderer log would be
 * attributed to the main process module.
 */

import type { Logger, LogLevel } from '@nocturna/logger'
import { ipcMain } from 'electron'
import { IPC_LOG_CHANNEL } from './ipc-channel.js'
import type { LogIpcPayload } from './types.js'

// Re-exported so consumers (and index.ts) keep the existing import path.
export { IPC_LOG_CHANNEL }

/**
 * Map IPC level strings to logger methods.
 */
const LEVEL_METHOD = {
	DEBUG: 'debug',
	INFO: 'info',
	WARN: 'warn',
	ERROR: 'error',
	CRITICAL: 'critical',
} as const satisfies Record<Exclude<LogLevel, 'SILENT'>, keyof Logger>

/**
 * Register the IPC listener. Call once in main.ts at startup.
 *
 * @param createLoggerFor - Factory that builds a logger for a given module name.
 *                          Called once per distinct renderer module, then cached.
 */
export function createIpcLogHandler(createLoggerFor: (module: string) => Logger): void {
	// Cache one logger per renderer module — avoid rebuilding on every log call.
	const loggers = new Map<string, Logger>()

	ipcMain.on(IPC_LOG_CHANNEL, (_event, payload: LogIpcPayload) => {
		const { level, module: mod, message, traceId, operation, data, error } = payload

		// SILENT entries are never sent, but guard anyway — nothing to write to.
		if (level === 'SILENT') return

		let logger = loggers.get(mod)
		if (!logger) {
			logger = createLoggerFor(mod)
			loggers.set(mod, logger)
		}

		const method = LEVEL_METHOD[level]
		logger[method](message, { traceId, operation, data, error })
	})
}
