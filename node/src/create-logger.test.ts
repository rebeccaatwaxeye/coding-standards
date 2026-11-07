import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLogger } from './create-logger.js'
import type { LogEntry, Sink } from './types.js'

/**
 * Test sink that captures entries instead of writing them.
 */
function captureSink(): Sink & { entries: LogEntry[] } {
	const entries: LogEntry[] = []
	return {
		entries,
		write(entry: LogEntry) {
			entries.push(entry)
		},
	}
}

describe('createLogger', () => {
	const originalEnv = process.env.NODE_ENV
	const originalLogLevel = process.env.LOG_LEVEL

	beforeEach(() => {
		delete process.env.LOG_LEVEL
		process.env.NODE_ENV = 'development'
	})

	afterEach(() => {
		process.env.NODE_ENV = originalEnv
		if (originalLogLevel === undefined) {
			delete process.env.LOG_LEVEL
		} else {
			process.env.LOG_LEVEL = originalLogLevel
		}
		vi.restoreAllMocks()
	})

	describe('level filtering', () => {
		it('emits all levels when configured at DEBUG', () => {
			const sink = captureSink()
			const log = createLogger({ module: 'test', level: 'DEBUG', sinks: [sink] })

			log.debug('d')
			log.info('i')
			log.warn('w')
			log.error('e')
			log.critical('c')

			expect(sink.entries.map((e) => e.level)).toEqual([
				'DEBUG',
				'INFO',
				'WARN',
				'ERROR',
				'CRITICAL',
			])
		})

		it('emits only ERROR and CRITICAL at the production ERROR floor', () => {
			const sink = captureSink()
			const log = createLogger({ module: 'test', level: 'ERROR', sinks: [sink] })

			log.debug('d')
			log.info('i')
			log.warn('w')
			log.error('e')
			log.critical('c')

			expect(sink.entries.map((e) => e.level)).toEqual(['ERROR', 'CRITICAL'])
		})

		it('emits nothing when SILENT', () => {
			const sink = captureSink()
			const log = createLogger({ module: 'test', level: 'SILENT', sinks: [sink] })

			log.debug('d')
			log.info('i')
			log.critical('c')

			expect(sink.entries).toHaveLength(0)
		})
	})

	describe('logger shape', () => {
		it('exposes the bound module name', () => {
			const log = createLogger({ module: 'billing', sinks: [captureSink()] })
			expect(log.module).toBe('billing')
		})

		it('is callable as a shorthand for info()', () => {
			const sink = captureSink()
			const log = createLogger({ module: 'test', level: 'DEBUG', sinks: [sink] })

			log('shorthand message')

			expect(sink.entries).toHaveLength(1)
			expect(sink.entries[0]?.level).toBe('INFO')
			expect(sink.entries[0]?.message).toBe('shorthand message')
		})
	})

	describe('entry contents', () => {
		it('builds a structured entry with timestamp, level, module, message', () => {
			const sink = captureSink()
			const log = createLogger({ module: 'api', level: 'DEBUG', sinks: [sink] })

			log.info('server started')

			const entry = sink.entries[0]!
			expect(entry.level).toBe('INFO')
			expect(entry.module).toBe('api')
			expect(entry.message).toBe('server started')
			expect(entry.timestamp).toMatch(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/)
		})

		it('carries traceId, operation, and data from meta', () => {
			const sink = captureSink()
			const log = createLogger({ module: 'api', level: 'DEBUG', sinks: [sink] })

			log.info('request', {
				traceId: 'abc123',
				operation: 'getPages',
				data: { count: 5 },
			})

			const entry = sink.entries[0]!
			expect(entry.traceId).toBe('abc123')
			expect(entry.operation).toBe('getPages')
			expect(entry.data).toEqual({ count: 5 })
		})
	})

	describe('error normalisation', () => {
		it('preserves name, message, stack, and code from an Error', () => {
			const sink = captureSink()
			const log = createLogger({ module: 'api', level: 'DEBUG', sinks: [sink] })
			const err = new Error('db down')
			err.stack = 'Error: db down\n  at foo'

			log.error('query failed', { error: err })

			const entry = sink.entries[0]!.error!
			expect(entry.name).toBe('Error')
			expect(entry.message).toBe('db down')
			expect(entry.stack).toContain('at foo')
		})

		it('preserves a custom error code', () => {
			const sink = captureSink()
			const log = createLogger({ module: 'api', level: 'DEBUG', sinks: [sink] })
			const err = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })

			log.error('request failed', { error: err })

			expect(sink.entries[0]!.error!.code).toBe('ETIMEDOUT')
		})

		it('normalises a string error', () => {
			const sink = captureSink()
			const log = createLogger({ module: 'api', level: 'DEBUG', sinks: [sink] })

			log.error('failed', { error: 'just a string' })

			expect(sink.entries[0]!.error).toEqual({
				name: 'Error',
				message: 'just a string',
			})
		})

		it('normalises a plain object error', () => {
			const sink = captureSink()
			const log = createLogger({ module: 'api', level: 'DEBUG', sinks: [sink] })

			log.error('failed', { error: { message: 'obj error', code: 'X1' } })

			const entry = sink.entries[0]!.error!
			expect(entry.message).toBe('obj error')
			expect(entry.code).toBe('X1')
		})

		it('leaves error undefined when none provided', () => {
			const sink = captureSink()
			const log = createLogger({ module: 'api', level: 'DEBUG', sinks: [sink] })

			log.info('all good')

			expect(sink.entries[0]!.error).toBeUndefined()
		})
	})

	describe('message formatting', () => {
		it.each<[string, unknown, string]>([
			['undefined', undefined, ''],
			['null', null, 'null'],
			['string', 'hello', 'hello'],
			['number', 42, '42'],
			['boolean', true, 'true'],
		])('formats %s', (_label, input, expected) => {
			const sink = captureSink()
			const log = createLogger({ module: 't', level: 'DEBUG', sinks: [sink] })
			log.info(input)
			expect(sink.entries[0]!.message).toBe(expected)
		})

		it('JSON-stringifies objects passed as the message', () => {
			const sink = captureSink()
			const log = createLogger({ module: 't', level: 'DEBUG', sinks: [sink] })

			log.info({ id: 1 })

			expect(sink.entries[0]!.message).toBe('{"id":1}')
		})

		it('uses the error message when an Error is passed as the message', () => {
			const sink = captureSink()
			const log = createLogger({ module: 't', level: 'DEBUG', sinks: [sink] })

			log.info(new Error('boom'))

			expect(sink.entries[0]!.message).toBe('boom')
		})
	})

	describe('redaction integration', () => {
		it('redacts sensitive data before it reaches the sink', () => {
			const sink = captureSink()
			const log = createLogger({ module: 'auth', level: 'DEBUG', sinks: [sink] })

			log.info('login', { data: { user: 'alice', password: 'hunter2' } })

			const data = sink.entries[0]!.data as Record<string, unknown>
			expect(data.user).toBe('alice')
			expect(data.password).toBe('[REDACTED]')
		})

		it('honours additional redaction patterns', () => {
			const sink = captureSink()
			const log = createLogger({
				module: 'test',
				level: 'DEBUG',
				sinks: [sink],
				redact: { additionalPatterns: ['internal_id'] },
			})

			log.info('x', { data: { internal_id: 'abc', user: 'alice' } })

			const data = sink.entries[0]!.data as Record<string, unknown>
			expect(data.internal_id).toBe('[REDACTED]')
			expect(data.user).toBe('alice')
		})
	})

	describe('sink failure handling', () => {
		it('never throws when a sink fails — logs to stderr and disables it', () => {
			const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
			const brokenSink: Sink = {
				write() {
					throw new Error('sink exploded')
				},
			}

			const log = createLogger({ module: 'test', level: 'DEBUG', sinks: [brokenSink] })

			expect(() => log.info('hello')).not.toThrow()
			expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('sink exploded'))

			// Sink is disabled after first failure — no repeat writes
			stderrSpy.mockClear()
			log.info('second')
			expect(stderrSpy).not.toHaveBeenCalled()
		})

		it('keeps working with healthy sinks when one fails', () => {
			vi.spyOn(process.stderr, 'write').mockReturnValue(true)
			const brokenSink: Sink = {
				write() {
					throw new Error('broken')
				},
			}
			const sink = captureSink()

			const log = createLogger({
				module: 'test',
				level: 'DEBUG',
				sinks: [brokenSink, sink],
			})

			log.info('still works')

			expect(sink.entries).toHaveLength(1)
			expect(sink.entries[0]!.message).toBe('still works')
		})
	})

	describe('dispose', () => {
		it('calls dispose on all sinks', () => {
			const disposed = vi.fn()
			const sink: Sink = {
				write() {
					/* capture nothing */
				},
				dispose: disposed,
			}

			const log = createLogger({ module: 'test', sinks: [sink] })
			log.dispose()

			expect(disposed).toHaveBeenCalledTimes(1)
		})

		it('does not throw when a sink dispose fails', () => {
			const sink: Sink = {
				write() {
					/* capture nothing */
				},
				dispose() {
					throw new Error('dispose failed')
				},
			}

			const log = createLogger({ module: 'test', sinks: [sink] })

			expect(() => log.dispose()).not.toThrow()
		})
	})
})
