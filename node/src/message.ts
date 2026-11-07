import type { LogError } from './types.js'

/**
 * Coerce any loggable value into a string message.
 * Shared by the core logger and the Electron renderer bridge so both
 * sides format identically.
 */
export function formatMessage(msg: unknown): string {
	if (msg === undefined) return ''
	if (msg === null) return 'null'
	if (typeof msg === 'string') return msg
	if (typeof msg === 'number' || typeof msg === 'boolean') return String(msg)
	if (msg instanceof Error) return msg.message
	try {
		return JSON.stringify(msg)
	} catch {
		return String(msg)
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

/**
 * Normalise any thrown value into structured `{ name, message, stack?, code? }`
 * data — stack is preserved, never lost to `String(err)`. Shared by the core
 * logger and the Electron renderer bridge.
 */
export function normaliseError(err: unknown): LogError | undefined {
	if (!err) return undefined
	if (err instanceof Error) {
		return {
			name: err.name,
			message: err.message,
			stack: err.stack,
			code: isRecord(err) && typeof err.code === 'string' ? err.code : undefined,
		}
	}
	if (typeof err === 'string') {
		return { name: 'Error', message: err }
	}
	if (isRecord(err)) {
		return {
			name: String(err.name ?? 'Error'),
			message: String(err.message ?? JSON.stringify(err)),
			stack: typeof err.stack === 'string' ? err.stack : undefined,
			code: typeof err.code === 'string' ? err.code : undefined,
		}
	}
	return { name: 'Error', message: String(err) }
}
