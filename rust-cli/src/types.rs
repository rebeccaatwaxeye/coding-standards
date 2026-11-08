//! Canonical log types — the struct passed to every sink.
//! Never format entries yourself; sinks handle formatting.

use serde_json::Value as JsonValue;
use std::sync::Arc;

/// Numeric severity — higher value = more severe.
/// Spaced by 10 so new levels can be inserted without renumbering.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum LogLevel {
    Silent,
    Debug,
    Info,
    Warn,
    Error,
    Critical,
}

impl LogLevel {
    pub const fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Silent => "SILENT",
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warn => "WARN",
            LogLevel::Error => "ERROR",
            LogLevel::Critical => "CRITICAL",
        }
    }

    pub const fn value(&self) -> u8 {
        match self {
            LogLevel::Silent => 0,
            LogLevel::Debug => 10,
            LogLevel::Info => 20,
            LogLevel::Warn => 30,
            LogLevel::Error => 40,
            LogLevel::Critical => 50,
        }
    }

    /// Case-insensitive parse, mirroring `LOG_LEVEL` handling.
    pub fn parse(raw: &str) -> Option<LogLevel> {
        match raw.to_ascii_uppercase().as_str() {
            "SILENT" => Some(LogLevel::Silent),
            "DEBUG" => Some(LogLevel::Debug),
            "INFO" => Some(LogLevel::Info),
            "WARN" => Some(LogLevel::Warn),
            "ERROR" => Some(LogLevel::Error),
            "CRITICAL" => Some(LogLevel::Critical),
            _ => None,
        }
    }

    /// Level column is 8 chars wide ("CRITICAL").
    pub fn padded(&self) -> String {
        format!("{:<8}", self.as_str())
    }
}

/// Error as structured data — stack is preserved, never lost.
#[derive(Debug, Clone)]
pub struct LogError {
    pub name: String,
    pub message: String,
    pub stack: Option<String>,
    pub code: Option<String>,
}

impl LogError {
    pub fn from_message(message: impl Into<String>) -> Self {
        LogError {
            name: "Error".into(),
            message: message.into(),
            stack: None,
            code: None,
        }
    }

    /// Capture name, message, and a forced backtrace from any error.
    pub fn from_error<E: ?Sized + std::error::Error>(err: &E) -> Self {
        let full = std::any::type_name::<E>();
        let name = full.rsplit("::").next().unwrap_or(full).to_string();
        let stack = std::backtrace::Backtrace::force_capture().to_string();
        LogError {
            name,
            message: err.to_string(),
            stack: if stack.is_empty() { None } else { Some(stack) },
            code: None,
        }
    }

    /// Like [`LogError::from_error`] but reads the OS error code, mirroring
    /// the `code` field of Node-style errors.
    pub fn from_io_error(err: &std::io::Error) -> Self {
        let mut meta = LogError::from_error(err);
        meta.code = err.raw_os_error().map(|c| c.to_string());
        meta
    }

    pub fn with_code(mut self, code: impl Into<String>) -> Self {
        self.code = Some(code.into());
        self
    }
}

impl From<&str> for LogError {
    fn from(message: &str) -> Self {
        LogError::from_message(message)
    }
}

impl From<String> for LogError {
    fn from(message: String) -> Self {
        LogError::from_message(message)
    }
}

/// Structured log entry — the canonical type passed to every sink.
#[derive(Debug, Clone)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: LogLevel,
    pub module: String,
    pub message: String,
    /// Caller location: `file:line` where supported.
    pub location: Option<String>,
    /// Trace ID for log↔trace correlation.
    pub trace_id: Option<String>,
    /// The operation name (e.g. 'startScan', 'getPages').
    pub operation: Option<String>,
    /// Structured payload / result data. Redacted before it reaches a sink.
    pub data: Option<JsonValue>,
    /// Error details — carries `{ name, message, stack, code }`, never `String(err)`.
    pub error: Option<LogError>,
}

/// Metadata accepted by logger methods.
/// `level`, `module`, `timestamp`, and `location` are injected automatically;
/// callers provide only what varies per call.
#[derive(Debug, Clone, Default)]
pub struct LogMeta {
    pub trace_id: Option<String>,
    pub operation: Option<String>,
    pub data: Option<JsonValue>,
    pub error: Option<LogError>,
}

/// Sink interface — every output backend implements this.
/// The logger calls `sink.write(entry)` for every entry that passes the level
/// filter. A sink must never panic; failures are reported to stderr and the
/// sink is disabled.
pub trait Sink: Send + Sync {
    fn write(&self, entry: &LogEntry);
    /// Optional: called when the logger is disposed. Sinks that hold
    /// resources should clean up.
    fn dispose(&self) {}
}

/// Shared sink handle — what you pass to [`LoggerOptions::sink`](crate::LoggerOptions::sink).
pub type SharedSink = Arc<dyn Sink>;
