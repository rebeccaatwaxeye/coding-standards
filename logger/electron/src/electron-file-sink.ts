/**
 * Electron-specific file sink — uses `app.getPath('userData')` as the default directory.
 *
 * This is a convenience wrapper around `@nocturna/logger`'s `fileSink()` with
 * the Electron-aware default path. Prefer this over importing `fileSink()` directly
 * in Electron main-process code.
 */

import { join } from 'node:path'
import type { FileSinkOptions, Sink } from '@nocturna/logger'
import { fileSink } from '@nocturna/logger'
import { app } from 'electron'

/**
 * Create a file sink that writes to `app.getPath('userData')/logs/` by default.
 *
 * @example
 * ```ts
 * import { electronFileSink } from '@nocturna/logger-electron'
 *
 * const log = createLogger({
 *   module: 'main',
 *   sinks: [electronFileSink()], // writes to ~/Library/Application Support/YourApp/logs/
 * })
 * ```
 */
export function electronFileSink(
	options: Omit<FileSinkOptions, 'dir'> & { dir?: string } = {},
): Sink {
	return fileSink({
		// Only touch Electron's app API when we actually need the default path
		dir: options.dir ?? join(app.getPath('userData'), 'logs'),
		retainDays: options.retainDays ?? 7,
		maxTotalSizeMB: options.maxTotalSizeMB ?? 100,
	})
}
