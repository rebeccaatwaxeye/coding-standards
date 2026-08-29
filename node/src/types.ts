/**
 * Structured log entry — the canonical type passed to every sink.
 * Never format this yourself; sinks handle formatting.
 */
export interface LogEntry {
  timestamp: string
  level: LogLevel
  module: string
  message: string
  /** Caller location: `file:line` where supported. */
  location?: string
  /** W3C traceparent trace ID for log↔trace correlation. */
  traceId?: string
  /** The operation name (e.g. 'startScan', 'getPages'). */
  operation?: string
  /** Structured payload / result data. Redacted before it reaches a sink. */
  data?: unknown
  /** Error details — carries `{ name, message, stack, code? }`, never `String(err)`. */
  error?: LogError
}

/**
 * Error as structured data — stack is preserved, never lost.
 */
export interface LogError {
  name: string
  message: string
  stack?: string
  code?: string
}

/**
 * Metadata accepted by logger methods.
 * `level`, `module`, `timestamp`, and `location` are injected automatically;
 * callers provide only what varies per call.
 */
export interface LogMeta {
  traceId?: string
  operation?: string
  data?: unknown
  error?: unknown
}

/**
 * Numeric severity — higher value = more severe.
 * Spaced by 10 so new levels can be inserted without renumbering.
 */
export type LogLevel = 'SILENT' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'

export const LEVEL_VALUE: Record<LogLevel, number> = {
  SILENT: 0,
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  CRITICAL: 50,
}

/**
 * Sink interface — every output backend implements this.
 * The logger calls `sink.write(entry)` for every entry that passes the level filter.
 * A sink must never throw; failures are reported to stderr and the sink is disabled.
 */
export interface Sink {
  write(entry: LogEntry): void
  /** Optional: called when the logger is disposed. Sinks that hold resources should clean up. */
  dispose?(): void
}

/**
 * Logger instance — the object returned by `createLogger()`.
 * Callable as shorthand for `info()`: `log('hello')` === `log.info('hello')`.
 */
export interface Logger {
  /** Shorthand for `info()`. */
  (message?: unknown, meta?: LogMeta): void
  debug(message?: unknown, meta?: LogMeta): void
  info(message?: unknown, meta?: LogMeta): void
  warn(message?: unknown, meta?: LogMeta): void
  error(message?: unknown, meta?: LogMeta): void
  critical(message?: unknown, meta?: LogMeta): void
  /** Dispose all sinks. Call on shutdown. */
  dispose(): void
  /** The module name bound to this logger instance. */
  readonly module: string
}

/**
 * Configuration for `createLogger()`.
 */
export interface LoggerOptions {
  /** Module name — bound once, not repeated per call. */
  module: string
  /**
   * Minimum level to emit.
   * Default: `DEBUG` in development, `ERROR` in production, overridden by `LOG_LEVEL` env.
   */
  level?: LogLevel
  /** Sinks to write to. Default: `[consoleSink()]` */
  sinks?: Sink[]
  /**
   * Mandatory redaction — always on, cannot be disabled.
   * Additional keys/patterns to redact beyond the built-in list.
   */
  redact?: {
    /** Additional key patterns (regex or string) to redact. */
    additionalPatterns?: (string | RegExp)[]
    /** Set to false to disable built-in patterns — NOT RECOMMENDED. */
    includeDefaults?: boolean
  }
}
