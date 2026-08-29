import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import type { FileSinkOptions, Sink } from '@nocturna/logger'
import { electronFileSink } from './electron-file-sink.js'

const USER_DATA = '/Users/test/Library/Application Support/MyApp'

// Mock Electron's app.getPath
const getPath = vi.fn((_name: string): string => USER_DATA)
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => getPath(name),
  },
}))

// Mock the core fileSink so we assert on the config it receives
const fileSinkMock = vi.fn((_options: FileSinkOptions): Sink => ({ write: vi.fn() }))
vi.mock('@nocturna/logger', () => ({
  fileSink: (options: FileSinkOptions) => fileSinkMock(options),
}))

describe('electronFileSink', () => {
  beforeEach(() => {
    getPath.mockClear()
    fileSinkMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves the log dir from app.getPath("userData")', () => {
    electronFileSink()

    expect(getPath).toHaveBeenCalledWith('userData')
    const [options] = fileSinkMock.mock.calls[0]!
    expect(options.dir).toBe(join('/Users/test/Library/Application Support/MyApp', 'logs'))
  })

  it('defaults to 7-day retention for desktop', () => {
    electronFileSink()

    const [options] = fileSinkMock.mock.calls[0]!
    expect(options.retainDays).toBe(7)
  })

  it('defaults to a 100 MB size cap', () => {
    electronFileSink()

    const [options] = fileSinkMock.mock.calls[0]!
    expect(options.maxTotalSizeMB).toBe(100)
  })

  it('honours an explicit dir override', () => {
    electronFileSink({ dir: '/custom/logs' })

    const [options] = fileSinkMock.mock.calls[0]!
    expect(options.dir).toBe('/custom/logs')
    expect(getPath).not.toHaveBeenCalled()
  })

  it('honours explicit retention and size overrides', () => {
    electronFileSink({ retainDays: 30, maxTotalSizeMB: 500 })

    const [options] = fileSinkMock.mock.calls[0]!
    expect(options.retainDays).toBe(30)
    expect(options.maxTotalSizeMB).toBe(500)
  })

  it('returns the sink produced by the core fileSink', () => {
    const result = electronFileSink()
    expect(result).toBe(fileSinkMock.mock.results[0]!.value)
  })
})
