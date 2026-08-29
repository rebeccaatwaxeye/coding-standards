/**
 * @nocturna/logger-electron — Electron-specific logger extensions.
 *
 * @example
 * ```ts
 * // main.ts
 * import { createLogger, consoleSink } from '@nocturna/logger'
 * import {
 *   electronFileSink,
 *   createIpcLogHandler,
 *   installGlobalHandlers,
 * } from '@nocturna/logger-electron'
 *
 * // Share sinks so main and renderer logs land in the same file
 * const sinks = [consoleSink(), electronFileSink()]
 *
 * const log = createLogger({ module: 'main', sinks })
 *
 * installGlobalHandlers(log)
 * createIpcLogHandler((module) => createLogger({ module, sinks }))
 * ```
 *
 * ```ts
 * // preload.ts
 * import '@nocturna/logger-electron/preload'
 * ```
 *
 * ```ts
 * // renderer.ts
 * import { createRendererLogger } from '@nocturna/logger-electron'
 *
 * const log = createRendererLogger('renderer/ui')
 * log.info('app started')
 * ```
 */

// --- Re-export core ---
export type {
  LogLevel,
  LogEntry,
  LogError,
  LogMeta,
  Logger,
  LoggerOptions,
  Sink,
} from '@nocturna/logger'
export { LEVEL_VALUE } from '@nocturna/logger'
export { createLogger } from '@nocturna/logger'
export { consoleSink, jsonSink } from '@nocturna/logger'

// --- Electron-specific ---
export { electronFileSink } from './electron-file-sink.js'
export { createIpcLogHandler, IPC_LOG_CHANNEL } from './ipc-handler.js'
export { createRendererLogger } from './renderer.js'
export { installGlobalHandlers } from './global-handlers.js'

// --- Types ---
export type { ElectronLogEntry, ElectronProcess, LogIpcPayload } from './types.js'
