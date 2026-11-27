import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRendererLogger } from './renderer.js'

type Bridge = (
	level: string,
	module: string,
	message: string,
	meta?: Record<string, unknown>,
) => void

/**
 * Install a fake `window` with an optional log bridge.
 * Node has no `window`, so we stub the minimum the renderer logger touches.
 */
function installWindow(bridge?: Bridge) {
	const win: { __nocturnaLog?: Bridge } = {}
	if (bridge) win.__nocturnaLog = bridge
	;(globalThis as { window?: unknown }).window = win
	return win
}

describe('createRendererLogger', () => {
	const originalEnv = process.env.NODE_ENV
	const originalLogLevel = process.env.LOG_LEVEL

	beforeEach(() => {
		delete process.env.LOG_LEVEL
		process.env.NODE_ENV = 'development'
	})

	afterEach(() => {
		delete (globalThis as { window?: unknown }).window
		process.env.NODE_ENV = originalEnv
		if (originalLogLevel === undefined) {
			delete process.env.LOG_LEVEL
		} else {
			process.env.LOG_LEVEL = originalLogLevel
		}
		vi.restoreAllMocks()
	})

	describe('IPC forwarding', () => {
		it('forwards entries to the preload bridge when available', () => {
			const bridge = vi.fn()
			installWindow(bridge)

			const log = createRendererLogger('renderer/ui', 'DEBUG')
			log.info('hello from renderer')

			expect(bridge).toHaveBeenCalledTimes(1)
			const [level, module, message] = bridge.mock.calls[0]!
			expect(level).toBe('INFO')
			expect(module).toBe('renderer/ui')
			expect(message).toBe('hello from renderer')
		})

		it('forwards meta fields as a payload object', () => {
			const bridge = vi.fn()
			installWindow(bridge)

			const log = createRendererLogger('renderer/api', 'DEBUG')
			log.error('request failed', {
				traceId: 'trace-1',
				operation: 'fetchPages',
				data: { count: 2 },
				error: new Error('timeout'),
			})

			const [, , , payload] = bridge.mock.calls[0]!
			expect(payload.traceId).toBe('trace-1')
			expect(payload.operation).toBe('fetchPages')
			expect(payload.data).toEqual({ count: 2 })
			expect(payload.error).toMatchObject({ message: 'timeout' })
		})

		it('omits undefined meta fields from the payload', () => {
			const bridge = vi.fn()
			installWindow(bridge)

			const log = createRendererLogger('renderer/ui', 'DEBUG')
			log.info('plain')

			const [, , , payload] = bridge.mock.calls[0]!
			expect(payload).toEqual({})
		})
	})

	describe('console fallback', () => {
		it('falls back to console when the bridge is missing', () => {
			const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {
				/* no-op */
			})
			installWindow() // no bridge

			const log = createRendererLogger('renderer/ui', 'DEBUG')
			log.info('no bridge here')

			expect(infoSpy).toHaveBeenCalledTimes(1)
			const [message] = infoSpy.mock.calls[0]!
			expect(message).toContain('[renderer/ui]')
			expect(message).toContain('[INFO]')
			expect(message).toContain('no bridge here')
		})

		it('routes ERROR and CRITICAL to console.error in fallback mode', () => {
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
				/* no-op */
			})
			installWindow()

			const log = createRendererLogger('renderer/ui', 'DEBUG')
			log.error('bad')
			log.critical('worse')

			expect(errorSpy).toHaveBeenCalledTimes(2)
		})

		it('routes WARN to console.warn in fallback mode', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
				/* no-op */
			})
			installWindow()

			const log = createRendererLogger('renderer/ui', 'DEBUG')
			log.warn('careful')

			expect(warnSpy).toHaveBeenCalledTimes(1)
		})

		it('routes DEBUG to console.debug in fallback mode', () => {
			const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {
				/* no-op */
			})
			installWindow()

			const log = createRendererLogger('renderer/ui', 'DEBUG')
			log.debug('verbose')

			expect(debugSpy).toHaveBeenCalledTimes(1)
		})
	})

	describe('level filtering', () => {
		it('emits only ERROR and CRITICAL at the ERROR floor', () => {
			const bridge = vi.fn()
			installWindow(bridge)

			const log = createRendererLogger('renderer/ui', 'ERROR')
			log.debug('d')
			log.info('i')
			log.warn('w')
			log.error('e')
			log.critical('c')

			expect(bridge.mock.calls.map((c) => c[0])).toEqual(['ERROR', 'CRITICAL'])
		})

		it('emits everything at DEBUG', () => {
			const bridge = vi.fn()
			installWindow(bridge)

			const log = createRendererLogger('renderer/ui', 'DEBUG')
			log.debug('d')
			log.info('i')
			log.warn('w')
			log.error('e')
			log.critical('c')

			expect(bridge.mock.calls.map((c) => c[0])).toEqual([
				'DEBUG',
				'INFO',
				'WARN',
				'ERROR',
				'CRITICAL',
			])
		})

		it('emits nothing at SILENT', () => {
			const bridge = vi.fn()
			installWindow(bridge)

			const log = createRendererLogger('renderer/ui', 'SILENT')
			log.info('i')
			log.critical('c')

			expect(bridge).not.toHaveBeenCalled()
		})
	})

	describe('logger shape', () => {
		it('exposes the bound module name', () => {
			installWindow(vi.fn())
			expect(createRendererLogger('renderer/ui', 'DEBUG').module).toBe('renderer/ui')
		})

		it('is callable as a shorthand for info()', () => {
			const bridge = vi.fn()
			installWindow(bridge)

			const log = createRendererLogger('renderer/ui', 'DEBUG')
			log('shorthand')

			expect(bridge.mock.calls[0]![0]).toBe('INFO')
			expect(bridge.mock.calls[0]![2]).toBe('shorthand')
		})

		it('dispose is a safe no-op', () => {
			installWindow(vi.fn())
			const log = createRendererLogger('renderer/ui', 'DEBUG')
			expect(() => log.dispose()).not.toThrow()
		})
	})

	describe('message formatting', () => {
		it.each([
			['string', 'hello', 'hello'],
			['number', 42, '42'],
			['boolean', true, 'true'],
			['null', null, 'null'],
			['undefined', undefined, ''],
		])('formats %s messages', (_label, input, expected) => {
			const bridge = vi.fn()
			installWindow(bridge)

			const log = createRendererLogger('renderer/ui', 'DEBUG')
			log.info(input)

			expect(bridge.mock.calls[0]![2]).toBe(expected)
		})

		it('uses the error message when an Error is the message', () => {
			const bridge = vi.fn()
			installWindow(bridge)

			const log = createRendererLogger('renderer/ui', 'DEBUG')
			log.info(new Error('boom'))

			expect(bridge.mock.calls[0]![2]).toBe('boom')
		})

		it('JSON-stringifies object messages', () => {
			const bridge = vi.fn()
			installWindow(bridge)

			const log = createRendererLogger('renderer/ui', 'DEBUG')
			log.info({ id: 7 })

			expect(bridge.mock.calls[0]![2]).toBe('{"id":7}')
		})
	})
})
