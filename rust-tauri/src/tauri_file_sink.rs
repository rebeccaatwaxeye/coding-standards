//! Tauri file sink — uses `app_data_dir()` as the default directory.
//!
//! This is a convenience wrapper around the core `file_sink()` with the
//! Tauri-aware default path. Prefer this over importing `file_sink()` directly
//! in Tauri main-process code.
//!
//! Defaults mirror `@nocturna/logger-electron`: `userData/logs`, 7-day
//! retention, 100 MB size cap.

use nocturna_logger::{file_sink, FileSinkOptions, SharedSink};
use std::path::PathBuf;
use tauri::Manager;

/// Create a file sink that writes to `app_data_dir()/logs/` by default.
///
/// ```ignore
/// use nocturna_logger::create_logger;
/// use nocturna_logger_tauri::tauri_file_sink;
///
/// let logs_sink = tauri_file_sink(app.handle());
/// ```
pub fn tauri_file_sink<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> SharedSink {
    let dir = app
        .path()
        .app_data_dir()
        .map(|base: PathBuf| base.join("logs"))
        .unwrap_or_else(|_| PathBuf::from("./logs"));

    file_sink(FileSinkOptions {
        dir,
        retain_days: 7,
        max_total_size_mb: 100.0,
    })
}

/// Compute the default log directory from an app-data base path.
/// Exposed for parity with `@nocturna/logger-electron`'s `userData/logs`.
pub fn default_log_dir(app_data_dir: PathBuf) -> PathBuf {
    app_data_dir.join("logs")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_log_dir_appends_logs() {
        let dir = default_log_dir(PathBuf::from(
            "/Users/test/Library/Application Support/MyApp",
        ));
        assert_eq!(
            dir.to_string_lossy(),
            "/Users/test/Library/Application Support/MyApp/logs"
        );
    }
}
