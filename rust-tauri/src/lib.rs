//! `nocturna-logger-tauri` — Tauri-specific logger extensions.
//!
//! Dependency direction is one-way: the core crate (`nocturna-logger`)
//! never depends on Tauri; this crate depends on the core.
//!
//! ```ignore
//! # use nocturna_logger::{console_sink, create_logger, LoggerOptions};
//! # use nocturna_logger_tauri::{set_log_handler_factory, tauri_file_sink};
//! # use std::sync::Arc;
//! # fn setup<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
//!
//! // Share sinks so webview and main-process logs land in the same file.
//! let sinks = vec![console_sink(), tauri_file_sink(app)];
//!
//! set_log_handler_factory(Arc::new(move |module| {
//!     create_logger(LoggerOptions::new(module).sinks(sinks.clone()))
//! }));
//! # }
//! ```
//!
//! In the webview, forward logs over IPC:
//!
//! ```js
//! import { invoke } from '@tauri-apps/api/core'
//! invoke('nocturna_log', { payload: { level: 'INFO', module: 'ui', message: 'app started' } })
//! ```

mod ipc_handler;
mod tauri_file_sink;

#[cfg(feature = "tauri")]
pub use ipc_handler::nocturna_log;
pub use ipc_handler::{
    handle_log_payload, set_log_handler_factory, LogIpcPayload, IPC_LOG_CHANNEL,
};
#[cfg(feature = "tauri")]
pub use tauri_file_sink::{default_log_dir, tauri_file_sink};

// Re-export the core so consumer apps need only this crate.
pub use nocturna_logger::{
    console_sink, create_logger, file_sink, install_global_handlers, json_sink, resolve_level,
    should_log, FileSinkOptions, JsonSinkOptions, LogEntry, LogError, LogLevel, LogMeta, Logger,
    LoggerOptions, SharedSink, Sink,
};
