import type { Sink, LogEntry } from '../types.js'
import { formatAnsi, formatBrowserArgs } from '../format.js'

/**
 * Console sink — works in both Node and the browser.
 *
 * - Node: ANSI-coloured output with timestamp + bold module name.
 * - Browser: coloured badge via `console[level](...)` with CSS styling.
 *
 * This is the default sink when none is provided.
 */
export function consoleSink(): Sink {
  return {
    write(entry: LogEntry) {
      if (isBrowser()) {
        const args = formatBrowserArgs(entry)
        const consoleMethod = getBrowserConsole(entry.level)
        consoleMethod.call(console, ...args)
      } else {
        const line = formatAnsi(entry)
        if (entry.level === 'ERROR' || entry.level === 'CRITICAL') {
          process.stderr.write(line)
        } else {
          process.stdout.write(line)
        }
      }
    },
  }
}

function isBrowser(): boolean {
  return typeof window !== 'undefined'
    && typeof window.document !== 'undefined'
    && typeof console !== 'undefined'
}

function getBrowserConsole(level: string): typeof console.debug {
  switch (level) {
    case 'CRITICAL':
    case 'ERROR':  return console.error
    case 'WARN':   return console.warn
    case 'DEBUG':  return console.debug
    default:       return console.info
  }
}
