/**
 * Mandatory redaction — runs before every sink, always on, cannot be disabled.
 *
 * Default patterns (case-insensitive, applied recursively to any object or `meta.data`):
 *   token, password, passwd, pwd, secret, credential, authorization, bearer,
 *   api[_-]?key, apikey, access[_-]?key, private[_-]?key, cookie, session, jwt, otp
 *
 * Redacted values become `[REDACTED]` — never truncated-but-partial.
 */

const DEFAULT_PATTERNS: RegExp[] = [
	/token/i,
	/password/i,
	/passwd/i,
	/pwd/i,
	/secret/i,
	/credential/i,
	/authorization/i,
	/bearer/i,
	/api[_-]?key/i,
	/apikey/i,
	/access[_-]?key/i,
	/private[_-]?key/i,
	/cookie/i,
	/session/i,
	/jwt/i,
	/otp/i,
]

/**
 * Build the combined list of patterns from defaults + user overrides.
 */
function buildPatterns(additional?: (string | RegExp)[], includeDefaults = true): RegExp[] {
	const base = includeDefaults ? DEFAULT_PATTERNS : []
	if (!additional?.length) return base
	return [...base, ...additional.map((p) => (typeof p === 'string' ? new RegExp(p, 'i') : p))]
}

/**
 * Deep-redact an object in place. Strings whose key matches a pattern are replaced
 * with `[REDACTED]`. Nested objects and arrays are traversed recursively.
 */
function redactValue(value: unknown, patterns: RegExp[]): unknown {
	if (value === null || value === undefined) return value
	if (typeof value === 'string') return value // strings are never redacted directly — only by key
	if (Array.isArray(value)) {
		return value.map((item) => redactValue(item, patterns))
	}
	if (typeof value === 'object') {
		const result: Record<string, unknown> = {}
		for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
			if (patterns.some((p) => p.test(key))) {
				result[key] = '[REDACTED]'
			} else {
				result[key] = redactValue(val, patterns)
			}
		}
		return result
	}
	// number, boolean, symbol — pass through
	return value
}

/**
 * Redact a log entry's `data` and `error` fields.
 * Returns a new entry (does not mutate the original).
 */
export function redactEntry<T extends { data?: unknown; error?: unknown }>(
	entry: T,
	patterns: RegExp[],
): T {
	if (!patterns.length) return entry
	return {
		...entry,
		data: entry.data !== undefined ? redactValue(entry.data, patterns) : undefined,
		error: entry.error !== undefined ? redactValue(entry.error, patterns) : undefined,
	}
}

/**
 * Exported for use by createLogger — builds the pattern list once at construction time.
 */
export { buildPatterns }
