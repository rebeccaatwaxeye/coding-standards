import { describe, expect, it } from 'vitest'
import { formatMessage, normaliseError } from './message.js'

describe('formatMessage', () => {
	it('passes strings through and stringifies primitives', () => {
		expect(formatMessage('hi')).toBe('hi')
		expect(formatMessage(undefined)).toBe('')
		expect(formatMessage(null)).toBe('null')
		expect(formatMessage(42)).toBe('42')
		expect(formatMessage(true)).toBe('true')
	})

	it('uses the message of Error instances', () => {
		expect(formatMessage(new Error('boom'))).toBe('boom')
	})

	it('JSON-stringifies objects and falls back to String()', () => {
		expect(formatMessage({ a: 1 })).toBe('{"a":1}')
		const circular: Record<string, unknown> = {}
		circular.self = circular
		expect(formatMessage(circular)).toBe('[object Object]')
	})
})

describe('normaliseError', () => {
	it('preserves name, message, stack, and code from Error instances', () => {
		const err = new Error('boom') as Error & { code?: string }
		err.code = 'E_TEST'
		const result = normaliseError(err)
		expect(result).toMatchObject({
			name: 'Error',
			message: 'boom',
			code: 'E_TEST',
		})
		expect(result?.stack).toContain('boom')
	})

	it('wraps plain strings', () => {
		expect(normaliseError('oops')).toEqual({ name: 'Error', message: 'oops' })
	})

	it('reads fields from error-like records', () => {
		expect(
			normaliseError({ name: 'HttpError', message: '404', code: 'ENOTFOUND', stack: 'at x' }),
		).toEqual({ name: 'HttpError', message: '404', code: 'ENOTFOUND', stack: 'at x' })
	})

	it('fills defaults for incomplete records', () => {
		expect(normaliseError({})).toEqual({ name: 'Error', message: '{}' })
		expect(normaliseError({ message: 'only' })).toEqual({
			name: 'Error',
			message: 'only',
		})
	})

	it('wraps non-error non-string values', () => {
		expect(normaliseError(42)).toEqual({ name: 'Error', message: '42' })
	})

	it('returns undefined for falsy input', () => {
		expect(normaliseError(undefined)).toBeUndefined()
		expect(normaliseError(null)).toBeUndefined()
		expect(normaliseError('')).toBeUndefined()
	})
})
