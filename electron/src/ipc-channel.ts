/**
 * IPC channel used by the preload bridge to send renderer logs to main.
 *
 * Single source of truth — `preload.ts` and `ipc-handler.ts` are separate
 * build entries and cannot import each other, so both import from here.
 * If this value changes, both sides change together.
 */
export const IPC_LOG_CHANNEL = '@nocturna/logger/log'
