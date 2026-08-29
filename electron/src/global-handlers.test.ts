import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { installGlobalHandlers } from './global-handlers.js'
import type { Logger } from '@nocturna/logger'

/**
 * Mock logger that records every call.
 */
function mockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    dispose: vi.fn(),
    module: 'test',
  } as unknown as Logger & {
    debug: ReturnType<typeof vi.fn>
    info: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
    critical: ReturnType<typeof vi.fn>
  }
}

type Handler = (...args: unknown[]) => void

describe('installGlobalHandlers', () => {
  let handlers: Map<string, Handler>
  let onSpy: ReturnType<typeof vi.spyOn>
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    handlers = new Map()
    onSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      handler: Handler,
    ) => {
      handlers.set(event, handler)
      return process
    }) as never)
    // Record the call — must not throw, or the throw escapes the timer callback
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never))
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('registers unhandledRejection and uncaughtException handlers', () => {
    installGlobalHandlers(mockLogger())

    expect(onSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function))
    expect(onSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function))
  })

  describe('unhandledRejection', () => {
    it('logs at CRITICAL with the rejection reason as error', () => {
      const log = mockLogger()
      installGlobalHandlers(log)

      const err = new Error('promise blew up')
      handlers.get('unhandledRejection')!(err)

      expect(log.critical).toHaveBeenCalledTimes(1)
      const [message, meta] = log.critical.mock.calls[0]!
      expect(message).toContain('Unhandled promise rejection')
      expect(meta.error).toBe(err)
      expect(meta.data).toEqual({ type: 'unhandledRejection' })
    })

    it('wraps non-Error rejection reasons', () => {
      const log = mockLogger()
      installGlobalHandlers(log)

      handlers.get('unhandledRejection')!('just a string')

      const [, meta] = log.critical.mock.calls[0]!
      expect(meta.error).toBeInstanceOf(Error)
      expect(meta.error.message).toBe('just a string')
    })

    it('exits non-zero after flushing', () => {
      const log = mockLogger()
      installGlobalHandlers(log)

      handlers.get('unhandledRejection')!(new Error('boom'))
      expect(exitSpy).not.toHaveBeenCalled()

      vi.advanceTimersByTime(200)
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('uncaughtException', () => {
    it('logs at CRITICAL with the error', () => {
      const log = mockLogger()
      installGlobalHandlers(log)

      const err = new Error('sync explosion')
      handlers.get('uncaughtException')!(err)

      expect(log.critical).toHaveBeenCalledTimes(1)
      const [message, meta] = log.critical.mock.calls[0]!
      expect(message).toContain('Uncaught exception')
      expect(meta.error).toBe(err)
      expect(meta.data).toEqual({ type: 'uncaughtException' })
    })

    it('exits non-zero after flushing', () => {
      const log = mockLogger()
      installGlobalHandlers(log)

      handlers.get('uncaughtException')!(new Error('boom'))
      vi.advanceTimersByTime(200)

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  it('never logs below CRITICAL for fatal errors', () => {
    const log = mockLogger()
    installGlobalHandlers(log)

    handlers.get('uncaughtException')!(new Error('boom'))
    handlers.get('unhandledRejection')!(new Error('boom'))

    expect(log.error).not.toHaveBeenCalled()
    expect(log.warn).not.toHaveBeenCalled()
    expect(log.info).not.toHaveBeenCalled()
    expect(log.debug).not.toHaveBeenCalled()
    expect(log.critical).toHaveBeenCalledTimes(2)
  })
})
