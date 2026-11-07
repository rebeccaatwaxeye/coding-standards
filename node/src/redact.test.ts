import { describe, expect, it } from 'vitest'
import { buildPatterns, redactEntry } from './redact.js'

describe('buildPatterns', () => {
	it('returns the built-in defaults when no overrides given', () => {
		const patterns = buildPatterns()
		expect(patterns.length).toBeGreaterThan(0)
		expect(patterns.some((p) => p.test('password'))).toBe(true)
	})

	it('appends custom string patterns (case-insensitive)', () => {
		const patterns = buildPatterns(['internal_id'])
		expect(patterns.some((p) => p.test('INTERNAL_ID'))).toBe(true)
	})

	it('appends custom regex patterns', () => {
		const patterns = buildPatterns([/^x-secret-/])
		expect(patterns.some((p) => p.test('x-secret-abc'))).toBe(true)
	})

	it('can omit defaults via includeDefaults false', () => {
		const patterns = buildPatterns(['custom'], false)
		expect(patterns.some((p) => p.test('custom'))).toBe(true)
		expect(patterns.some((p) => p.test('password'))).toBe(false)
	})
})

describe('redactEntry', () => {
	const patterns = buildPatterns()

	it('redacts known sensitive keys at top level', () => {
		const entry = { data: { password: 'hunter2', user: 'alice' } }
		const result = redactEntry(entry, patterns)
		expect(result.data).toEqual({ password: '[REDACTED]', user: 'alice' })
	})

	it('redacts keys case-insensitively', () => {
		const entry = { data: { API_KEY: 'abc', ApiKey: 'def', apikey: 'ghi' } }
		const result = redactEntry(entry, patterns)
		expect(result.data).toEqual({
			API_KEY: '[REDACTED]',
			ApiKey: '[REDACTED]',
			apikey: '[REDACTED]',
		})
	})

	it('redacts nested objects recursively', () => {
		const entry = {
			data: {
				request: {
					headers: { authorization: 'Bearer xyz', 'content-type': 'application/json' },
				},
			},
		}
		const result = redactEntry(entry, patterns) as typeof entry
		expect(result.data.request.headers.authorization).toBe('[REDACTED]')
		// non-sensitive keys survive
		expect(result.data.request.headers['content-type']).toBe('application/json')
	})

	it('redacts inside arrays', () => {
		const entry = { data: { users: [{ token: 'a' }, { token: 'b' }] } }
		const result = redactEntry(entry, patterns) as typeof entry
		expect(result.data.users).toEqual([{ token: '[REDACTED]' }, { token: '[REDACTED]' }])
	})

	it('redacts error fields too', () => {
		const entry = {
			error: {
				name: 'Error',
				message: 'failed',
				stack: 'stack trace',
				code: 'E_FAIL',
				password: 'secret-in-error',
			},
		}
		const result = redactEntry(entry, patterns) as typeof entry
		expect(result.error.password).toBe('[REDACTED]')
		expect(result.error.message).toBe('failed')
	})

	it('preserves non-sensitive data unchanged', () => {
		const entry = { data: { orderId: 42, status: 'ok', nested: { a: 1 } } }
		const result = redactEntry(entry, patterns)
		expect(result.data).toEqual({ orderId: 42, status: 'ok', nested: { a: 1 } })
	})

	it('does not mutate the original entry', () => {
		const entry = { data: { password: 'hunter2' } }
		redactEntry(entry, patterns)
		expect(entry.data.password).toBe('hunter2')
	})

	it('leaves entry untouched when there is no data or error', () => {
		const entry = { level: 'INFO', message: 'hello' } as const
		const result = redactEntry(entry, patterns)
		expect(result).toEqual(entry)
	})

	it('passes primitives through without redaction', () => {
		const entry = { data: 'plain string' }
		const result = redactEntry(entry, patterns)
		expect(result.data).toBe('plain string')
	})
})
