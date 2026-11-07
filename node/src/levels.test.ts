import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveLevel, shouldLog } from './levels.js'

describe('shouldLog', () => {
	it('emits entries at or above the minimum level', () => {
		// DEBUG >= DEBUG
		expect(shouldLog('DEBUG', 'DEBUG')).toBe(true)
		// ERROR >= DEBUG
		expect(shouldLog('ERROR', 'DEBUG')).toBe(true)
		// CRITICAL >= ERROR
		expect(shouldLog('CRITICAL', 'ERROR')).toBe(true)
	})

	it('suppresses entries below the minimum level', () => {
		// DEBUG < ERROR
		expect(shouldLog('DEBUG', 'ERROR')).toBe(false)
		// INFO < ERROR
		expect(shouldLog('INFO', 'ERROR')).toBe(false)
		// WARN < ERROR (production default must hide WARN)
		expect(shouldLog('WARN', 'ERROR')).toBe(false)
	})

	it('emits ERROR and CRITICAL at the production ERROR floor', () => {
		expect(shouldLog('ERROR', 'ERROR')).toBe(true)
		expect(shouldLog('CRITICAL', 'ERROR')).toBe(true)
	})

	it('suppresses everything at SILENT', () => {
		expect(shouldLog('DEBUG', 'SILENT')).toBe(false)
		expect(shouldLog('CRITICAL', 'SILENT')).toBe(false)
	})
})

describe('resolveLevel', () => {
	const originalEnv = process.env.NODE_ENV
	const originalLogLevel = process.env.LOG_LEVEL

	beforeEach(() => {
		delete process.env.LOG_LEVEL
	})

	afterEach(() => {
		process.env.NODE_ENV = originalEnv
		if (originalLogLevel === undefined) {
			delete process.env.LOG_LEVEL
		} else {
			process.env.LOG_LEVEL = originalLogLevel
		}
	})

	it('prefers an explicit level over env and environment detection', () => {
		process.env.LOG_LEVEL = 'SILENT'
		process.env.NODE_ENV = 'production'
		expect(resolveLevel('CRITICAL')).toBe('CRITICAL')
	})

	it('prefers LOG_LEVEL env over environment detection', () => {
		process.env.LOG_LEVEL = 'warn'
		process.env.NODE_ENV = 'development'
		expect(resolveLevel()).toBe('WARN')
	})

	it('is case-insensitive for LOG_LEVEL', () => {
		process.env.LOG_LEVEL = 'critical'
		expect(resolveLevel()).toBe('CRITICAL')
	})

	it('falls back to DEBUG in development', () => {
		process.env.NODE_ENV = 'development'
		expect(resolveLevel()).toBe('DEBUG')
	})

	it('falls back to ERROR in production (never SILENT)', () => {
		process.env.NODE_ENV = 'production'
		expect(resolveLevel()).toBe('ERROR')
	})

	it('falls back to SILENT in test', () => {
		process.env.NODE_ENV = 'test'
		expect(resolveLevel()).toBe('SILENT')
	})

	it('ignores invalid LOG_LEVEL values and falls through', () => {
		process.env.LOG_LEVEL = 'NOT_A_LEVEL'
		process.env.NODE_ENV = 'production'
		expect(resolveLevel()).toBe('ERROR')
	})
})
