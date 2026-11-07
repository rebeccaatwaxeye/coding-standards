import type { Logger } from '@nocturna/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIpcLogHandler, IPC_LOG_CHANNEL } from './ipc-handler.js'
import type { LogIpcPayload } from './types.js'

// Mock Electron's ipcMain before importing the module under test
const ipcOn = vi.fn()
vi.mock('electron', () => ({
	ipcMain: {
		on: (...args: unknown[]) => ipcOn(...args),
	},
}))

type IpcListener = (event: unknown, payload: LogIpcPayload) => void

/**
 * Mock logger recording every call.
 */
function mockLogger(module: string) {
	return {
		module,
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		critical: vi.fn(),
		dispose: vi.fn(),
	} as unknown as Logger & {
		debug: ReturnType<typeof vi.fn>
		info: ReturnType<typeof vi.fn>
		warn: ReturnType<typeof vi.fn>
		error: ReturnType<typeof vi.fn>
		critical: ReturnType<typeof vi.fn>
	}
}

describe('createIpcLogHandler', () => {
	let listener: IpcListener
	let created: Array<{ module: string; logger: ReturnType<typeof mockLogger> }>

	beforeEach(() => {
		ipcOn.mockClear()
		created = []
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	/** Sets up the handler and captures the registered listener. */
	function setup() {
		createIpcLogHandler((module) => {
			const logger = mockLogger(module)
			created.push({ module, logger })
			return logger
		})
		expect(ipcOn).toHaveBeenCalledWith(IPC_LOG_CHANNEL, expect.any(Function))
		listener = ipcOn.mock.calls[0]![1] as IpcListener
	}

	it('registers a listener on the log channel', () => {
		setup()
		expect(IPC_LOG_CHANNEL).toBe('@nocturna/logger/log')
	})

	describe('level routing', () => {
		it.each([
			['DEBUG', 'debug'],
			['INFO', 'info'],
			['WARN', 'warn'],
			['ERROR', 'error'],
			['CRITICAL', 'critical'],
		] as const)('routes %s payloads to logger.%s()', (level, method) => {
			setup()
			listener({}, { level, module: 'renderer/ui', message: 'hello' })

			const { logger } = created[0]!
			expect(logger[method]).toHaveBeenCalledTimes(1)
			const [message] = logger[method].mock.calls[0]!
			expect(message).toBe('hello')
		})

		it('passes traceId, operation, data, and error through as meta', () => {
			setup()
			listener(
				{},
				{
					level: 'ERROR',
					module: 'renderer/api',
					message: 'request failed',
					traceId: 'trace-123',
					operation: 'fetchPages',
					data: { count: 3 },
					error: { name: 'Error', message: 'timeout' },
				},
			)

			const { logger } = created[0]!
			const [, meta] = logger.error.mock.calls[0]!
			expect(meta.traceId).toBe('trace-123')
			expect(meta.operation).toBe('fetchPages')
			expect(meta.data).toEqual({ count: 3 })
			expect(meta.error).toEqual({ name: 'Error', message: 'timeout' })
		})

		it('ignores SILENT payloads — no logger is even created', () => {
			setup()
			listener({}, { level: 'SILENT', module: 'renderer/ui', message: 'nope' })

			// Short-circuits before the factory runs, so nothing is constructed
			expect(created).toHaveLength(0)
		})
	})

	describe('module preservation', () => {
		it('creates a logger named after the renderer module', () => {
			setup()
			listener({}, { level: 'INFO', module: 'renderer/checkout', message: 'x' })

			expect(created).toHaveLength(1)
			expect(created[0]!.module).toBe('renderer/checkout')
		})

		it('keeps separate loggers per renderer module', () => {
			setup()
			listener({}, { level: 'INFO', module: 'renderer/a', message: 'from a' })
			listener({}, { level: 'INFO', module: 'renderer/b', message: 'from b' })
			listener({}, { level: 'INFO', module: 'renderer/a', message: 'from a again' })

			expect(created).toHaveLength(2)
			expect(created.map((c) => c.module)).toEqual(['renderer/a', 'renderer/b'])
		})

		it('caches loggers — reuses the same instance for repeat modules', () => {
			setup()
			listener({}, { level: 'INFO', module: 'renderer/a', message: 'one' })
			listener({}, { level: 'INFO', module: 'renderer/a', message: 'two' })

			const { logger } = created[0]!
			expect(logger.info).toHaveBeenCalledTimes(2)
		})
	})
})
