/**
 * Preload script — exposes a safe logging bridge from renderer → main.
 *
 * Usage in your preload.ts:
 * ```ts
 * import '@nocturna/logger-electron/preload'
 * ```
 *
 * Or cherry-pick:
 * ```ts
 * import { setupLogBridge } from '@nocturna/logger-electron/preload'
 * setupLogBridge()
 * ```
 *
 * The renderer then accesses `window.__nocturnaLog(level, module, message, meta)`
 * which sends the entry over IPC to the main process handler.
 */

import { contextBridge, ipcRenderer } from 'electron'

const IPC_LOG_CHANNEL = '@nocturna/logger/log'

/**
 * Expose the log bridge on `window.__nocturnaLog`.
 * Safe — renderer cannot access the filesystem or Node APIs directly.
 */
contextBridge.exposeInMainWorld('__nocturnaLog', (
  level: string,
  module: string,
  message: string,
  meta?: Record<string, unknown>,
) => {
  ipcRenderer.send(IPC_LOG_CHANNEL, {
    level,
    module,
    message,
    ...meta,
  })
})

/**
 * Alternatively, call this function directly if you don't want the global.
 */
export function setupLogBridge(): void {
  contextBridge.exposeInMainWorld('__nocturnaLog', (
    level: string,
    module: string,
    message: string,
    meta?: Record<string, unknown>,
  ) => {
    ipcRenderer.send(IPC_LOG_CHANNEL, {
      level,
      module,
      message,
      ...meta,
    })
  })
}
