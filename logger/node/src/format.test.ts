import { describe, expect, it } from 'vitest'
import { formatAnsi, formatBrowserArgs, formatJson, formatPlainText } from './format.js'
import type { LogEntry } from './types.js'

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
	return {
		timestamp: '01-02-2026 14:05:32',
		level: 'INFO',
		module: 'api',
		message: 'server listening',
		...overrides,
	}
}

describe('formatPlainText', () => {
	it('formats timestamp, padded level, tag, and message', () => {
		const line = formatPlainText(makeEntry({ location: 'server.ts:42' }))
		expect(line).toBe('[01-02-2026 14:05:32] [INFO    ] [api/server.ts:42] server listening\n')
	})

	it('pads CRITICAL to the 8-char level column', () => {
		const line = formatPlainText(makeEntry({ level: 'CRITICAL' }))
		expect(line).toContain('[CRITICAL]')
	})

	it('omits the location segment when absent', () => {
		const line = formatPlainText(makeEntry())
		expect(line).toBe('[01-02-2026 14:05:32] [INFO    ] [api] server listening\n')
	})

	it('appends a meta suffix for traceId, operation, and error', () => {
		const line = formatPlainText(
			makeEntry({
				traceId: 'abc',
				operation: 'boot',
				error: { name: 'Error', message: 'boom' },
			}),
		)
		expect(line.trimEnd().endsWith('{traceId=abc, op=boot, error=boom}')).toBe(true)
	})
})

describe('formatJson', () => {
	it('emits one complete JSON line with core fields', () => {
		const line = formatJson(makeEntry())
		const parsed = JSON.parse(line) as Record<string, unknown>
		expect(line.endsWith('\n')).toBe(true)
		expect(parsed).toMatchObject({
			ts: '01-02-2026 14:05:32',
			level: 'INFO',
			module: 'api',
			msg: 'server listening',
		})
	})

	it('omits optional fields when absent', () => {
		const parsed = JSON.parse(formatJson(makeEntry())) as Record<string, unknown>
		expect(parsed).not.toHaveProperty('loc')
		expect(parsed).not.toHaveProperty('traceId')
		expect(parsed).not.toHaveProperty('op')
		expect(parsed).not.toHaveProperty('data')
		expect(parsed).not.toHaveProperty('error')
	})

	it('includes optional fields when present', () => {
		const parsed = JSON.parse(
			formatJson(
				makeEntry({
					location: 'a.ts:1',
					traceId: 't1',
					operation: 'op1',
					data: { x: 1 },
					error: { name: 'Error', message: 'boom' },
				}),
			),
		) as Record<string, unknown>
		expect(parsed.loc).toBe('a.ts:1')
		expect(parsed.traceId).toBe('t1')
		expect(parsed.op).toBe('op1')
		expect(parsed.data).toEqual({ x: 1 })
		expect(parsed.error).toEqual({ name: 'Error', message: 'boom' })
	})
})

describe('formatAnsi', () => {
	it('wraps the timestamp in dim codes', () => {
		const line = formatAnsi(makeEntry())
		expect(line).toContain('\x1b[2m[01-02-2026 14:05:32]\x1b[0m')
	})

	it('maps each level to its ANSI colour and icon', () => {
		const cases: Array<[LogEntry['level'], string, string]> = [
			['DEBUG', '\x1b[36m', '🐛'],
			['INFO', '\x1b[32m', 'ℹ️'],
			['WARN', '\x1b[33m', '⚠️'],
			['ERROR', '\x1b[31m', '❌'],
			['CRITICAL', '\x1b[35m', '🔥'],
		]
		for (const [level, ansi, icon] of cases) {
			const line = formatAnsi(makeEntry({ level }))
			expect(line).toContain(ansi)
			expect(line).toContain(icon)
		}
	})

	it('bolds the module tag', () => {
		const line = formatAnsi(makeEntry({ location: 'a.ts:9' }))
		expect(line).toContain('\x1b[1mapi/a.ts:9\x1b[0m')
	})
})

describe('formatBrowserArgs', () => {
	it('returns a badge with style, reset style, and message parts', () => {
		const args = formatBrowserArgs(makeEntry({ location: 'ui.ts:3' }))
		const [badge, badgeStyle, resetStyle] = args
		expect(args.length).toBeGreaterThanOrEqual(3)
		expect(badge).toContain('%c')
		expect(badge).toContain('api/ui.ts:3')
		expect(badge).toContain('ℹ️')
		expect(badgeStyle).toMatch(/^background:#[0-9a-f]{6};color:#fff;/)
		expect(resetStyle).toBe('background:transparent;color:inherit;')
	})

	it('picks the colour deterministically from the module name', () => {
		const [a] = formatBrowserArgs(makeEntry({ module: 'api' }))
		const [b] = formatBrowserArgs(makeEntry({ module: 'api' }))
		const [c] = formatBrowserArgs(makeEntry({ module: 'worker' }))
		expect(a).toBe(b)
		expect(a).not.toBe(c)
	})

	it('appends structured error details after the style args', () => {
		const error = { name: 'TypeError', message: 'x is not a function' }
		const args = formatBrowserArgs(makeEntry({ error }))
		expect(args.at(-1)).toEqual(error)
	})
})
