/**
 * Electron-specific log types — extends @nocturna/logger's LogEntry
 * with Electron process context.
 */
import type { LogEntry } from '@nocturna/logger'

/**
 * Which Electron process emitted the log.
 */
export type ElectronProcess = 'main' | 'renderer'

/**
 * Log entry enriched with Electron context — main vs renderer process.
 */
export interface ElectronLogEntry extends LogEntry {
	/** Which process emitted the log. */
	process: ElectronProcess
}

/**
 * IPC payload sent from renderer → main.
 */
export interface LogIpcPayload {
	level: LogEntry['level']
	module: string
	message: string
	location?: string
	traceId?: string
	operation?: string
	data?: unknown
	error?: { name: string; message: string; stack?: string; code?: string }
}
