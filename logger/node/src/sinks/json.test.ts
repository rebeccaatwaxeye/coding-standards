import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LogEntry } from '../types.js'
import { jsonSink } from './json.js'

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
	return {
		timestamp: '01-02-2026 14:05:32',
		level: 'INFO',
		module: 'api',
		message: 'hello',
		...overrides,
	}
}

// In-memory write stream — avoids spying on process.stdout entirely.
function memoryStream(): NodeJS.WriteStream & { writes: string[] } {
	const writes: string[] = []
	return {
		writes,
		write(chunk: string | Uint8Array): boolean {
			writes.push(String(chunk))
			return true
		},
	} as unknown as NodeJS.WriteStream & { writes: string[] }
}

describe('jsonSink (stdout)', () => {
	it('writes one JSON line per entry', () => {
		const stream = memoryStream()
		const sink = jsonSink({ stream })
		sink.write(makeEntry())
		sink.write(makeEntry({ level: 'ERROR', message: 'boom' }))

		expect(stream.writes).toHaveLength(2)
		for (const line of stream.writes) {
			expect(line.endsWith('\n')).toBe(true)
			expect(() => JSON.parse(line)).not.toThrow()
		}
		expect(JSON.parse(stream.writes[0]!).module).toBe('api')
		expect(JSON.parse(stream.writes[1]!).level).toBe('ERROR')
	})
})

describe('jsonSink (file)', () => {
	const dirs: string[] = []

	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
	})

	function tempFile(name = 'structured.jsonl'): string {
		const dir = mkdtempSync(join(tmpdir(), 'logger-json-'))
		dirs.push(dir)
		return join(dir, name)
	}

	it('appends JSONL entries and creates the parent directory', () => {
		const filePath = tempFile('nested/dir/structured.jsonl')
		const sink = jsonSink({ output: 'file', filePath })

		sink.write(makeEntry({ data: { orderId: 7 } }))
		sink.write(makeEntry({ message: 'second' }))

		const lines = readFileSync(filePath, 'utf8').trimEnd().split('\n')
		expect(lines).toHaveLength(2)
		expect(JSON.parse(lines[0]!)).toMatchObject({
			level: 'INFO',
			module: 'api',
			msg: 'hello',
			data: { orderId: 7 },
		})
		expect(JSON.parse(lines[1]!).msg).toBe('second')
	})

	it('reports write failures to stderr without throwing', () => {
		const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

		const sink = jsonSink({ output: 'file', filePath: '/proc/definitely/not/writable' })
		expect(() => sink.write(makeEntry())).not.toThrow()
		expect(stderrWrite).toHaveBeenCalledTimes(1)
		expect(stderrWrite.mock.calls[0]![0]).toContain('[logger/json]')
		stderrWrite.mockRestore()
	})
})
