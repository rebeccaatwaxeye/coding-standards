/**
 * §14.8 — Global error handlers for the Electron main process.
 *
 * Installs `unhandledRejection` and `uncaughtException` handlers
 * that log at CRITICAL and exit non-zero.
 *
 * Call `installGlobalHandlers(logger)` at the top of your main.ts entry point,
 * before any other work.
 */

import type { Logger } from '@nocturna/logger'

/**
 * Install main-process global error handlers.
 *
 * A process that cannot honour its invariants should die loudly
 * and be restarted by the supervisor — not limp along in an unknown state.
 */
export function installGlobalHandlers(logger: Logger): void {
  process.on('unhandledRejection', (reason, promise) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    logger.critical('Unhandled promise rejection — process cannot continue', {
      error,
      data: { type: 'unhandledRejection' },
    })
    // Give sinks time to flush to file before exiting
    setTimeout(() => process.exit(1), 200)
  })

  process.on('uncaughtException', (error) => {
    logger.critical('Uncaught exception — process cannot continue', {
      error,
      data: { type: 'uncaughtException' },
    })
    setTimeout(() => process.exit(1), 200)
  })
}
