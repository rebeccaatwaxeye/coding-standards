import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const exposeInMainWorld = vi.fn()
const ipcSend = vi.fn()

vi.mock('electron', () => ({
	contextBridge: {
		exposeInMainWorld: (key: string, value: unknown) => exposeInMainWorld(key, value),
	},
	ipcRenderer: {
		send: (channel: string, payload: unknown) => ipcSend(channel, payload),
	},
}))

type Bridge = (
	level: string,
	module: string,
	message: string,
	meta?: Record<string, unknown>,
) => void

describe('preload log bridge', () => {
	beforeEach(() => {
		exposeInMainWorld.mockClear()
		ipcSend.mockClear()
		vi.resetModules()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('exposes __nocturnaLog on import (module side effect)', async () => {
		await import('./preload.js')

		expect(exposeInMainWorld).toHaveBeenCalledTimes(1)
		const [key] = exposeInMainWorld.mock.calls[0]!
		expect(key).toBe('__nocturnaLog')
	})

	it('setupLogBridge() exposes the bridge explicitly', async () => {
		const { setupLogBridge } = await import('./preload.js')

		setupLogBridge()

		expect(exposeInMainWorld).toHaveBeenCalled()
		const [key, value] = exposeInMainWorld.mock.calls.at(-1)!
		expect(key).toBe('__nocturnaLog')
		expect(typeof value).toBe('function')
	})

	describe('bridge behaviour', () => {
		async function getBridge(): Promise<Bridge> {
			const { setupLogBridge } = await import('./preload.js')
			setupLogBridge()
			return exposeInMainWorld.mock.calls.at(-1)![1] as Bridge
		}

		it('sends the entry over the logger IPC channel', async () => {
			const bridge = await getBridge()

			bridge('INFO', 'renderer/ui', 'hello')

			expect(ipcSend).toHaveBeenCalledTimes(1)
			const [channel] = ipcSend.mock.calls[0]!
			expect(channel).toBe('@nocturna/logger/log')
		})

		it('sends level, module, and message in the payload', async () => {
			const bridge = await getBridge()

			bridge('ERROR', 'renderer/api', 'request failed')

			const [, payload] = ipcSend.mock.calls[0]!
			expect(payload).toMatchObject({
				level: 'ERROR',
				module: 'renderer/api',
				message: 'request failed',
			})
		})

		it('spreads meta fields into the payload', async () => {
			const bridge = await getBridge()

			bridge('INFO', 'renderer/ui', 'x', {
				traceId: 'trace-9',
				operation: 'render',
				data: { a: 1 },
			})

			const [, payload] = ipcSend.mock.calls[0]!
			expect(payload).toMatchObject({
				traceId: 'trace-9',
				operation: 'render',
				data: { a: 1 },
			})
		})

		it('works with no meta argument', async () => {
			const bridge = await getBridge()

			bridge('WARN', 'renderer/ui', 'careful')

			const [, payload] = ipcSend.mock.calls[0]!
			expect(payload).toEqual({
				level: 'WARN',
				module: 'renderer/ui',
				message: 'careful',
			})
		})
	})
})
