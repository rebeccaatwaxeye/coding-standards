import type { LogLevel } from './types.js'
import { LEVEL_VALUE } from './types.js'

/**
 * Resolve the effective log level from explicit param → env var → environment detection.
 *
 * Priority:
 *  1. Explicit `level` parameter (from createLogger options)
 *  2. `LOG_LEVEL` env var (case-insensitive)
 *  3. Environment detection: dev → DEBUG, prod → ERROR, test → SILENT
 */
export function resolveLevel(explicit?: LogLevel): LogLevel {
	if (explicit) return explicit

	const envLevel = getEnvLevel()
	if (envLevel) return envLevel

	if (isTest()) return 'SILENT'
	if (isDev()) return 'DEBUG'
	return 'ERROR'
}

/**
 * Returns true if `entry` should be emitted given `minimum`.
 *
 * SILENT is a disable switch, not a point on the severity scale — it suppresses
 * everything regardless of numeric ordering. (Its value of 0 would otherwise let
 * every entry through a `>=` comparison, which is the opposite of the intent.)
 */
export function shouldLog(entry: LogLevel, minimum: LogLevel): boolean {
	if (minimum === 'SILENT') return false
	if (entry === 'SILENT') return false
	return LEVEL_VALUE[entry] >= LEVEL_VALUE[minimum]
}

// --- Environment detection ---

function getEnvLevel(): LogLevel | null {
	const raw = getEnv('LOG_LEVEL')
	if (!raw) return null
	const upper = raw.toUpperCase() as LogLevel
	if (upper in LEVEL_VALUE) return upper
	return null
}

function isDev(): boolean {
	return (
		getEnv('NODE_ENV') === 'development' ||
		getEnv('DEV') === 'true' ||
		getEnv('VITE_DEV_SERVER_URL') !== undefined
	)
}

function isTest(): boolean {
	return getEnv('NODE_ENV') === 'test'
}

/**
 * Read an env var in a way that works in Node, Bun, Deno, and browser.
 * Browsers return undefined (no env vars).
 */
function getEnv(key: string): string | undefined {
	if (typeof process !== 'undefined' && process.env?.[key] !== undefined) {
		return process.env[key]
	}
	return undefined
}
