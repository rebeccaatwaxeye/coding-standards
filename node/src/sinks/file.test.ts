import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LogEntry } from '../types.js'
import { fileSink } from './file.js'

const NOW = new Date('2026-11-07T12:00:00')
const TODAY_FILE = 'app-2026-11-07.log'

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
	return {
		timestamp: '07-11-2026 12:00:00',
		level: 'INFO',
		module: 'api',
		message: 'hello',
		...overrides,
	}
}

describe('fileSink', () => {
	let dir: string

	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(NOW)
		dir = mkdtempSync(join(tmpdir(), 'logger-file-'))
	})

	afterEach(() => {
		vi.useRealTimers()
		rmSync(dir, { recursive: true, force: true })
	})

	function backdate(fileName: string, mtime: Date, size = 10): void {
		writeFileSync(join(dir, fileName), 'x'.repeat(size))
		utimesSync(join(dir, fileName), mtime, mtime)
	}

	it('creates the log dir and writes a dated plain-text file', () => {
		fileSink({ dir }).write(makeEntry())

		expect(existsSync(dir)).toBe(true)
		const content = readFileSync(join(dir, TODAY_FILE), 'utf8')
		expect(content).toBe('[07-11-2026 12:00:00] [INFO    ] [api] hello\n')
	})

	it('appends same-day entries to one file', () => {
		const sink = fileSink({ dir })
		sink.write(makeEntry({ message: 'first' }))
		sink.write(makeEntry({ message: 'second' }))

		const lines = readFileSync(join(dir, TODAY_FILE), 'utf8').trimEnd().split('\n')
		expect(lines).toHaveLength(2)
		expect(lines[1]).toContain('second')
	})

	it('rolls over to a new file the next day', () => {
		const sink = fileSink({ dir })
		sink.write(makeEntry({ message: 'day one' }))
		vi.setSystemTime(new Date('2026-11-08T12:00:00'))
		sink.write(makeEntry({ message: 'day two' }))

		expect(readFileSync(join(dir, TODAY_FILE), 'utf8')).toContain('day one')
		expect(readFileSync(join(dir, 'app-2026-11-08.log'), 'utf8')).toContain('day two')
	})

	it('prunes files older than retainDays (default 14)', () => {
		backdate('app-2020-01-01.log', new Date('2026-10-18T12:00:00'))
		backdate('app-2026-10-30.log', new Date('2026-10-30T12:00:00'))

		fileSink({ dir }).write(makeEntry())

		expect(existsSync(join(dir, 'app-2020-01-01.log'))).toBe(false)
		expect(existsSync(join(dir, 'app-2026-10-30.log'))).toBe(true)
	})

	it('removes oldest files first when the size cap is exceeded', () => {
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, TODAY_FILE), '')
		backdate('app-2020-01-01.log', NOW, 2048)
		backdate('app-2021-01-01.log', NOW, 2048)
		// ~4.2 KB total vs a ~3.1 KB cap: only the oldest file must go.
		const sink = fileSink({ dir, retainDays: 0, maxTotalSizeMB: 0.003 })

		sink.write(makeEntry())

		expect(existsSync(join(dir, 'app-2020-01-01.log'))).toBe(false)
		expect(existsSync(join(dir, 'app-2021-01-01.log'))).toBe(true)
		expect(existsSync(join(dir, TODAY_FILE))).toBe(true)
	})

	it('keeps old files when pruning is disabled', () => {
		backdate('app-2020-01-01.log', new Date('2026-10-08T12:00:00'))

		fileSink({ dir, retainDays: 0, maxTotalSizeMB: 0 }).write(makeEntry())

		expect(existsSync(join(dir, 'app-2020-01-01.log'))).toBe(true)
		expect(existsSync(join(dir, TODAY_FILE))).toBe(true)
	})

	it('honours explicit retention overrides', () => {
		backdate('app-2026-11-06.log', new Date('2026-11-05T12:00:00'))

		fileSink({ dir, retainDays: 1 }).write(makeEntry())

		expect(existsSync(join(dir, 'app-2026-11-06.log'))).toBe(false)
	})
})
