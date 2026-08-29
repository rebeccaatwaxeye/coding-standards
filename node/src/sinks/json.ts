import { appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Sink, LogEntry } from '../types.js'
import { formatJson } from '../format.js'

/**
 * Options for the structured JSON sink.
 */
export interface JsonSinkOptions {
  /** Output destination. Default: `stdout`. */
  output?: 'stdout' | 'file'
  /** File path when output is `file`. Default: `./logs/structured.jsonl` */
  filePath?: string
}

/**
 * Structured JSON sink — one JSON object per line (JSONL).
 *
 * Use in containerised services where the platform collects logs
 * (Uptrace, Loki, Bugsink, CloudWatch, etc.).
 *
 * When `LOG_FORMAT=json` is set, the createLogger factory wires this in
 * automatically alongside the console sink.
 */
export function jsonSink(options: JsonSinkOptions = {}): Sink {
  const output = options.output ?? 'stdout'

  if (output === 'stdout') {
    return {
      write(entry: LogEntry) {
        process.stdout.write(formatJson(entry))
      },
    }
  }

  // File mode
  const filePath = options.filePath ?? join('./logs', 'structured.jsonl')

  try {
    ensureDir(dirname(filePath))
  } catch {
    // best effort — write will fail and be caught there
  }

  return {
    write(entry: LogEntry) {
      try {
        appendFileSync(filePath, formatJson(entry))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`[logger/json] write failed: ${message}\n`)
      }
    },
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function dirname(p: string): string {
  const lastSlash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return lastSlash <= 0 ? '.' : p.slice(0, lastSlash)
}
