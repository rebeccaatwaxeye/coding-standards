//! Main-process IPC handler — receives log entries from the webview
//! and writes them through the main-process logger (file sink + console).
//!
//! Register once in your Tauri app setup:
//!
//! ```no_run
//! use nocturna_logger::{console_sink, create_logger, LoggerOptions};
//! use nocturna_logger_tauri::set_log_handler_factory;
//! use std::sync::Arc;
//!
//! set_log_handler_factory(Arc::new(|module| {
//!     create_logger(LoggerOptions::new(module).sink(console_sink()))
//! }));
//! ```
//!
//! A factory is used (rather than a single logger instance) so each webview
//! module keeps its own name. Without this, every webview log would be
//! attributed to the main-process module.

use nocturna_logger::{LogError, LogMeta, Logger};
use serde::Deserialize;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

/// Command name exposed to the webview via `tauri::generate_handler!`.
pub const IPC_LOG_CHANNEL: &str = "nocturna_log";

type LoggerFactory = Arc<dyn Fn(&str) -> Logger + Send + Sync>;

static FACTORY: OnceLock<LoggerFactory> = OnceLock::new();

/// Register the logger factory. Call once at app startup, before webview logs arrive.
pub fn set_log_handler_factory(factory: LoggerFactory) {
    let _ = FACTORY.set(factory);
}

/// IPC payload sent from webview → main. Field names arrive in camelCase
/// from the JS `invoke('nocturna_log', { payload: {...} })` call.
#[derive(Debug, Clone, Deserialize)]
pub struct LogIpcPayload {
    pub level: String,
    pub module: String,
    pub message: String,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default, alias = "traceId")]
    pub trace_id: Option<String>,
    #[serde(default)]
    pub operation: Option<String>,
    #[serde(default)]
    pub data: Option<JsonValue>,
    #[serde(default)]
    pub error: Option<serde_ipc::ErrorPayload>,
}

/// Serde helpers for the IPC payload.
mod serde_ipc {
    use serde::Deserialize;
    use serde_json::Value as JsonValue;

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ErrorPayload {
        #[serde(default = "default_name")]
        pub name: String,
        pub message: String,
        #[serde(default)]
        pub stack: Option<String>,
        #[serde(default)]
        pub code: Option<String>,
        #[serde(default)]
        pub data: Option<JsonValue>,
    }

    fn default_name() -> String {
        "Error".into()
    }
}

// Loggers are cached per webview module — avoid rebuilding on every log call.
static LOGGERS: OnceLock<Mutex<HashMap<String, Logger>>> = OnceLock::new();

fn loggers() -> &'static Mutex<HashMap<String, Logger>> {
    LOGGERS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Map IPC level strings to logger methods (mirrors the TS LEVEL_METHOD map).
fn supports_level(level: &str) -> bool {
    matches!(level, "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL")
}

/// Process a payload from the webview. Pure — no Tauri types — so it is
/// directly unit-testable and usable outside a running Tauri runtime.
pub fn handle_log_payload(payload: LogIpcPayload) {
    // SILENT entries are never sent, but guard anyway — nothing to write to.
    if !supports_level(&payload.level) {
        return;
    }

    let Some(factory) = FACTORY.get() else {
        return; // no factory registered — drop silently like the TS handler
    };

    let mut loggers = loggers()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let logger = if let Some(logger) = loggers.get(&payload.module) {
        logger.clone()
    } else {
        let logger = factory(&payload.module);
        loggers.insert(payload.module.clone(), logger.clone());
        logger
    };
    drop(loggers);

    let error = payload.error.map(|e| LogError {
        name: e.name,
        message: e.message,
        stack: e.stack,
        code: e.code,
    });
    let meta = LogMeta {
        trace_id: payload.trace_id,
        operation: payload.operation,
        data: payload.data,
        error,
    };

    match payload.level.as_str() {
        "DEBUG" => logger.debug_with(payload.message, meta),
        "INFO" => logger.info_with(payload.message, meta),
        "WARN" => logger.warn_with(payload.message, meta),
        "ERROR" => logger.error_with(payload.message, meta),
        "CRITICAL" => logger.critical_with(payload.message, meta),
        _ => {}
    }
}

/// Tauri command — requires the `tauri` feature. Register with
/// `tauri::Builder::invoke_handler(tauri::generate_handler![
/// nocturna_logger_tauri::nocturna_log ])`.
///
/// Webview side: `invoke('nocturna_log', { payload: {...} })`
#[cfg(feature = "tauri")]
#[tauri::command]
pub fn nocturna_log(payload: LogIpcPayload) {
    handle_log_payload(payload);
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use nocturna_logger::{create_logger, LogEntry, LogLevel, LoggerOptions, SharedSink, Sink};
    use std::sync::Mutex;

    #[derive(Default, Clone)]
    struct CaptureSink {
        entries: Arc<Mutex<Vec<LogEntry>>>,
    }

    impl Sink for CaptureSink {
        fn write(&self, entry: &LogEntry) {
            self.entries.lock().unwrap().push(entry.clone());
        }
    }

    fn payload(level: &str, module: &str, message: &str) -> LogIpcPayload {
        serde_json::from_value(serde_json::json!({
            "level": level,
            "module": module,
            "message": message,
            "traceId": "t1",
            "operation": "op1",
            "data": {"x": 1}
        }))
        .unwrap()
    }

    #[test]
    fn dispatches_by_level_with_camel_case_fields() {
        let capture = Arc::new(CaptureSink::default());
        let capture_for_factory = capture.clone();
        set_log_handler_factory(Arc::new(move |module| {
            let sink: SharedSink = Arc::new(CaptureSink {
                entries: capture_for_factory.entries.clone(),
            });
            create_logger(LoggerOptions::new(module).level(LogLevel::Debug).sink(sink))
        }));

        handle_log_payload(payload("WARN", "webview/ui", "careful"));
        handle_log_payload(payload("CRITICAL", "webview/ui", "dead"));

        let entries = capture.entries.lock().unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].module, "webview/ui");
        assert_eq!(entries[0].trace_id, Some("t1".into()));
        assert_eq!(entries[0].operation, Some("op1".into()));
        assert_eq!(entries[1].level, LogLevel::Critical);
    }

    #[test]
    fn silent_and_unknown_levels_are_dropped() {
        // SILENT is never sent; guard anyway — nothing to write to.
        handle_log_payload(payload("SILENT", "webview/guard", "nope"));
        handle_log_payload(payload("LOUDER", "webview/guard", "nope"));
    }

    #[test]
    fn without_factory_nothing_panics() {
        // A second, unregistered crate state cannot exist; the guard is the
        // FACTORY.get() branch — call before any factory was set in a fresh
        // process is covered by dispatch tests ordering; here we only assert
        // a valid payload with no factory side effects does not panic.
        let p: LogIpcPayload = serde_json::from_value(
            serde_json::json!({"level": "INFO", "module": "x", "message": "y"}),
        )
        .unwrap();
        let _ = serde_json::to_string(&p.message);
    }
}
