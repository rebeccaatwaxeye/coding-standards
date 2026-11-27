/**
 * @nocturna/logger — zero-dependency structured logger for Node and the browser.
 *
 * @example
 * ```ts
 * import { createLogger, consoleSink, fileSink } from '@nocturna/logger'
 *
 * const log = createLogger({
 *   module: 'worker',
 *   sinks: [consoleSink(), fileSink({ dir: './logs', retainDays: 14 })],
 * })
 *
 * log.info('job started', { operation: 'processOrder' })
 * log.error('payment failed', { error: paymentErr, data: { orderId } })
 * ```
 */

// --- Core ---
export { createLogger } from './create-logger.js'
// --- Levels ---
export { resolveLevel, shouldLog } from './levels.js'
// --- Message helpers (shared with the Electron renderer bridge) ---
export { formatMessage, normaliseError } from './message.js'
// --- Redaction ---
export { buildPatterns, redactEntry } from './redact.js'

// --- Sinks ---
export { consoleSink } from './sinks/console.js'
export type { FileSinkOptions } from './sinks/file.js'
export { fileSink } from './sinks/file.js'
export type { JsonSinkOptions } from './sinks/json.js'
export { jsonSink } from './sinks/json.js'
// --- Types ---
export type {
	LogEntry,
	LogError,
	Logger,
	LoggerOptions,
	LogLevel,
	LogMeta,
	Sink,
} from './types.js'
export { LEVEL_VALUE } from './types.js'
