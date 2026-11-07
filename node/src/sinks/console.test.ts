import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LogEntry } from '../types.js'
import { consoleSink } from './console.js'

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
	return {
		timestamp: '01-02-2026 14:05:32',
		level: 'INFO',
		module: 'api',
		message: 'hello',
		...overrides,
	}
}

describe('consoleSink (Node)', () => {
	const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
	const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

	afterEach(() => {
		stdoutWrite.mockClear()
		stderrWrite.mockClear()
	})

	it('writes INFO to stdout with ANSI formatting', () => {
		consoleSink().write(makeEntry())
		expect(stdoutWrite).toHaveBeenCalledTimes(1)
		const line = stdoutWrite.mock.calls[0]![0] as string
		expect(line).toContain('\x1b[1mapi\x1b[0m')
		expect(line).toContain('hello')
		expect(line).toContain('\x1b[')
	})

	it('writes DEBUG, WARN to stdout', () => {
		const sink = consoleSink()
		sink.write(makeEntry({ level: 'DEBUG' }))
		sink.write(makeEntry({ level: 'WARN' }))
		expect(stdoutWrite).toHaveBeenCalledTimes(2)
		expect(stderrWrite).not.toHaveBeenCalled()
	})

	it('routes ERROR and CRITICAL to stderr', () => {
		const sink = consoleSink()
		sink.write(makeEntry({ level: 'ERROR' }))
		sink.write(makeEntry({ level: 'CRITICAL' }))
		expect(stderrWrite).toHaveBeenCalledTimes(2)
		expect(stdoutWrite).not.toHaveBeenCalled()
	})
})

describe('consoleSink (browser)', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	function stubBrowser(): ReturnType<typeof vi.spyOn> {
		vi.stubGlobal('window', { document: {} })
		return vi.spyOn(console, 'info').mockImplementation(() => {
			/* no-op */
		})
	}

	it('uses console.info with badge arguments instead of stdout', () => {
		const infoSpy = stubBrowser()
		const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

		consoleSink().write(makeEntry())

		expect(infoSpy).toHaveBeenCalledTimes(1)
		const args = infoSpy.mock.calls[0]!
		expect(String(args[0])).toContain('api')
		expect(String(args[0])).toContain('%c')
		expect(args[1]).toMatch(/^background:#[0-9a-f]{6}/)
		expect(stderrWrite).not.toHaveBeenCalled()
	})

	it('maps CRITICAL to console.error in the browser', () => {
		vi.stubGlobal('window', { document: {} })
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
			/* no-op */
		})

		consoleSink().write(makeEntry({ level: 'CRITICAL' }))

		expect(errorSpy).toHaveBeenCalledTimes(1)
	})

	it('maps WARN to console.warn in the browser', () => {
		vi.stubGlobal('window', { document: {} })
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
			/* no-op */
		})

		consoleSink().write(makeEntry({ level: 'WARN' }))

		expect(warnSpy).toHaveBeenCalledTimes(1)
	})
})
