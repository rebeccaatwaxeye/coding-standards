import type { LogEntry } from './types.js'
import { LEVEL_VALUE } from './types.js'

// ---- Formatters used by the console and file sinks ----

const LEVEL_ICON: Record<string, string> = {
  DEBUG: '🐛',
  INFO: 'ℹ️',
  WARN: '⚠️',
  ERROR: '❌',
  CRITICAL: '🔥',
}

const LEVEL_PAD = 8 // widest is "CRITICAL" = 8 chars

/**
 * Plain-text format for file sinks.
 * Format: `[2026-08-29 14:05:32] [ERROR  ] [module/file:line] message {meta}`
 */
export function formatPlainText(entry: LogEntry): string {
  const level = entry.level.padEnd(LEVEL_PAD)
  const location = entry.location ? `/${entry.location}` : ''
  const tag = `${entry.module}${location}`
  const meta = buildMetaSuffix(entry)
  return `[${entry.timestamp}] [${level}] [${tag}] ${entry.message}${meta}\n`
}

/**
 * One-liner JSON format for structured output (containers, log aggregators).
 * Each line is a complete JSON object — safe for log streaming.
 */
export function formatJson(entry: LogEntry): string {
  const obj: Record<string, unknown> = {
    ts: entry.timestamp,
    level: entry.level,
    module: entry.module,
    msg: entry.message,
  }
  if (entry.location) obj.loc = entry.location
  if (entry.traceId) obj.traceId = entry.traceId
  if (entry.operation) obj.op = entry.operation
  if (entry.data !== undefined) obj.data = entry.data
  if (entry.error) obj.error = entry.error
  return JSON.stringify(obj) + '\n'
}

/**
 * ANSI colour code for console output.
 */
const LEVEL_ANSI: Record<string, string> = {
  DEBUG: '\x1b[36m',   // cyan
  INFO:  '\x1b[32m',   // green
  WARN:  '\x1b[33m',   // yellow
  ERROR: '\x1b[31m',   // red
  CRITICAL: '\x1b[35m', // magenta
}
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'

// 10 browser-safe colours — module name hashed to pick one
const BROWSER_COLOURS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e',
]

function hashModule(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h)
  }
  return Math.abs(h)
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const normalized = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean
  const bigint = parseInt(normalized, 16)
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  }
}

/**
 * ANSI-formatted console line (Node / terminal).
 * [HH:MM:SS] 🔥 CRITICAL [module/file:12] message
 */
export function formatAnsi(entry: LogEntry): string {
  const icon = LEVEL_ICON[entry.level] ?? ''
  const ansiLevel = LEVEL_ANSI[entry.level] ?? ''
  const location = entry.location ? `/${entry.location}` : ''
  const meta = buildMetaSuffix(entry)
  return `${DIM}[${entry.timestamp}]${RESET} ${ansiLevel}${BOLD}${icon} ${entry.level.padEnd(LEVEL_PAD)}${RESET} ${BOLD}${entry.module}${location}${RESET} ${entry.message}${meta}\n`
}

/**
 * Browser console arguments — badge style + message, for use with `console[level](...)`.
 */
export function formatBrowserArgs(entry: LogEntry): [string, string, ...unknown[]] {
  const color = BROWSER_COLOURS[hashModule(entry.module) % BROWSER_COLOURS.length]
  const icon = LEVEL_ICON[entry.level] ?? ''
  const location = entry.location ? `/${entry.location}` : ''
  const badge = `%c ${entry.module}${location} %c ${icon} ${entry.level} ${entry.message}`
  const badgeStyle = `background:${color};color:#fff;padding:2px 4px;border-radius:3px;font-weight:bold;`
  const resetStyle = 'background:transparent;color:inherit;'
  const consoleMethod = mapLevelToConsole(entry.level)
  return [badge, badgeStyle, resetStyle, ...(entry.error ? [entry.error] : [])]
}

function mapLevelToConsole(level: string): 'debug' | 'info' | 'warn' | 'error' {
  switch (level) {
    case 'CRITICAL': return 'error'
    case 'ERROR':    return 'error'
    case 'WARN':     return 'warn'
    case 'DEBUG':    return 'debug'
    default:         return 'info'
  }
}

function buildMetaSuffix(entry: LogEntry): string {
  const parts: string[] = []
  if (entry.traceId) parts.push(`traceId=${entry.traceId}`)
  if (entry.operation) parts.push(`op=${entry.operation}`)
  if (entry.error) parts.push(`error=${entry.error.message}`)
  return parts.length > 0 ? ` {${parts.join(', ')}}` : ''
}
