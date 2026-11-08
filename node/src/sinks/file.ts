import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { formatPlainText } from '../format.js'
import type { LogEntry, Sink } from '../types.js'

/**
 * Options for the file sink.
 */
export interface FileSinkOptions {
	/**
	 * Directory to write log files into.
	 * Default: `./logs`
	 */
	dir?: string
	/**
	 * How many days of log files to retain. Default: 14.
	 * Set to 0 to disable pruning (not recommended).
	 */
	retainDays?: number
	/**
	 * Max total size of the log directory in MB. Default: 100.
	 * Oldest files are pruned first when exceeded.
	 */
	maxTotalSizeMB?: number
}

/**
 * File sink — writes daily-rotated plain-text logs.
 *
 * File name pattern: `app-YYYY-MM-DD.log`
 *
 * Prunes files older than `retainDays` (default 14) on first write of each day.
 * If the log directory exceeds `maxTotalSizeMB`, oldest files are removed first.
 *
 * Designed for: Node servers, CLI tools, Electron main process.
 * NOT for browser/renderer — there is no filesystem there.
 */
export function fileSink(options: FileSinkOptions = {}): Sink {
	const dir = options.dir ?? './logs'
	const retainDays = options.retainDays ?? 14
	const maxTotalSizeMB = options.maxTotalSizeMB ?? 100

	let currentFilePath: string | null = null
	let currentDateString: string | null = null
	let prunedToday = false

	return {
		write(entry: LogEntry) {
			const today = getDate()
			if (today !== currentDateString) {
				currentDateString = today
				currentFilePath = join(dir, `app-${today}.log`)
				prunedToday = false
			}

			try {
				ensureDir(dir)
				appendFileSync(currentFilePath!, formatPlainText(entry))

				if (!prunedToday) {
					prunedToday = true
					pruneOldFiles(dir, retainDays, maxTotalSizeMB)
				}
			} catch (err) {
				// Logger must never crash the app — fail to stderr and continue.
				const message = err instanceof Error ? err.message : String(err)
				process.stderr.write(`[logger/file] write failed: ${message}\n`)
			}
		},
	}
}

// ---- Internals ----

function getDate(): string {
	const now = new Date()
	const y = now.getFullYear()
	const m = String(now.getMonth() + 1).padStart(2, '0')
	const d = String(now.getDate()).padStart(2, '0')
	return `${y}-${m}-${d}`
}

function ensureDir(dir: string): void {
	if (existsSync(dir)) {
		return
	}
	try {
		mkdirSync(dir)
	} catch (err) {
		// Recursive mkdirSync hangs on musl when an ancestor is not
		// writable (e.g. EPERM under procfs) — create one level at a
		// time so unwritable ancestors throw instead of blocking.
		if ((err as NodeJS.ErrnoException).code === 'ENOENT' && dir !== dirname(dir)) {
			ensureDir(dirname(dir))
			mkdirSync(dir)
		} else {
			throw err
		}
	}
}

/**
 * Remove log files older than retainDays and total size exceeding maxTotalSizeMB.
 */
function pruneOldFiles(dir: string, retainDays: number, maxTotalSizeMB: number): void {
	if (retainDays <= 0 && maxTotalSizeMB <= 0) return

	let files: string[]
	try {
		files = readdirSync(dir)
			.filter((f) => f.startsWith('app-') && f.endsWith('.log'))
			.sort() // alphabetical = chronological
	} catch {
		return // directory read failed — skip pruning
	}

	const now = Date.now()
	const retainMs = retainDays * 24 * 60 * 60 * 1000
	const maxBytes = maxTotalSizeMB * 1024 * 1024

	let totalSize = 0

	for (const file of files) {
		const filePath = join(dir, file)
		try {
			const stat = statSync(filePath)
			totalSize += stat.size

			const ageMs = now - stat.mtimeMs
			if (ageMs > retainMs) {
				unlinkSync(filePath)
				totalSize -= stat.size
			}
		} catch {
			// skip unreadable files
		}
	}

	// If over total size cap, prune oldest first
	if (totalSize > maxBytes) {
		for (const file of files) {
			if (totalSize <= maxBytes) break
			const filePath = join(dir, file)
			try {
				const stat = statSync(filePath)
				unlinkSync(filePath)
				totalSize -= stat.size
			} catch {
				// skip
			}
		}
	}
}
