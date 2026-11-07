import { describe, expect, it } from 'vitest'
import { nocturnaLoggerRules } from '../configs/eslint.flat.js'

/**
 * Pins the public contract of the shipped `@nocturna/logger/configs`
 * export. If `configs/eslint.flat.js` changes, this test (and the
 * hand-maintained `eslint.flat.d.ts`) must be updated together.
 */
describe('nocturnaLoggerRules (§14.4 config contract)', () => {
	it('exports a single flat-config segment', () => {
		expect(Array.isArray(nocturnaLoggerRules)).toBe(true)
		expect(nocturnaLoggerRules).toHaveLength(1)
	})

	it('bans empty catch blocks', () => {
		expect(nocturnaLoggerRules[0]!.rules['no-empty']).toEqual(['error', { allowEmptyCatch: false }])
	})

	it('requires every caught error to be used', () => {
		expect(nocturnaLoggerRules[0]!.rules['@typescript-eslint/no-unused-vars']).toEqual([
			'error',
			{ caughtErrors: 'all' },
		])
	})

	it('bans console in consumer code', () => {
		expect(nocturnaLoggerRules[0]!.rules['no-console']).toEqual(['error', { allow: [] }])
	})
})
