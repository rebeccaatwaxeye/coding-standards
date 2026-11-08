//! The logger factory and instance (§14.3).
//!
//! - Module name bound once at creation — not repeated per call.
//! - Calls are silenced when the entry level < configured minimum.
//! - Redaction runs before every sink, always on.
//! - The logger never panics; a failing sink is reported to stderr and disabled.

use crate::levels::{resolve_level, should_log};
use crate::redact::{build_patterns, redact_data};
use crate::types::{LogEntry, LogLevel, LogMeta, SharedSink};
use chrono::Local;
use regex::Regex;
use std::collections::HashSet;
use std::io::Write;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{Arc, Mutex};

/// Configuration for [`create_logger`].
pub struct LoggerOptions {
    pub module: String,
    /// Minimum level to emit. Default: `DEBUG` in development, `ERROR` in
    /// production, `SILENT` in tests, overridden by the `LOG_LEVEL` env var.
    pub level: Option<LogLevel>,
    /// Sinks to write to. Default: `[console_sink()]`.
    pub sinks: Option<Vec<SharedSink>>,
    /// Additional key patterns (case-insensitive substrings) to redact.
    pub redact_additional: Vec<String>,
    /// Set to false to disable the built-in patterns — NOT RECOMMENDED.
    pub redact_include_defaults: bool,
}

impl LoggerOptions {
    pub fn new(module: impl Into<String>) -> Self {
        LoggerOptions {
            module: module.into(),
            level: None,
            sinks: None,
            redact_additional: Vec::new(),
            redact_include_defaults: true,
        }
    }

    pub fn level(mut self, level: LogLevel) -> Self {
        self.level = Some(level);
        self
    }

    pub fn sink(mut self, sink: SharedSink) -> Self {
        let mut sinks = self.sinks.unwrap_or_default();
        sinks.push(sink);
        self.sinks = Some(sinks);
        self
    }

    pub fn sinks(mut self, sinks: Vec<SharedSink>) -> Self {
        self.sinks = Some(sinks);
        self
    }

    pub fn redact_additional(mut self, patterns: Vec<String>) -> Self {
        self.redact_additional = patterns;
        self
    }

    pub fn redact_include_defaults(mut self, include: bool) -> Self {
        self.redact_include_defaults = include;
        self
    }
}

struct Inner {
    module: String,
    explicit_level: Option<LogLevel>,
    patterns: Vec<Regex>,
    sinks: Vec<SharedSink>,
    disabled: Mutex<HashSet<usize>>,
}

/// Logger instance — the object returned by [`create_logger`].
/// `log()` is the shorthand for `info()`.
#[derive(Clone)]
pub struct Logger {
    inner: Arc<Inner>,
}

/// Create a structured logger.
pub fn create_logger(options: LoggerOptions) -> Logger {
    let patterns = build_patterns(&options.redact_additional, options.redact_include_defaults);
    let sinks: Vec<SharedSink> = match options.sinks {
        Some(sinks) => sinks,
        None => vec![crate::sinks::console_sink()],
    };
    Logger {
        inner: Arc::new(Inner {
            module: options.module,
            explicit_level: options.level,
            patterns,
            sinks,
            disabled: Mutex::new(HashSet::new()),
        }),
    }
}

fn timestamp_now() -> String {
    Local::now().format("%d-%m-%Y %H:%M:%S").to_string()
}

/// Caller `file:line` (basename only), mirroring the TS output shape.
#[track_caller]
fn caller_location() -> Option<String> {
    let loc = std::panic::Location::caller();
    let file = loc.file();
    let basename = file.rsplit(['/', '\\']).next().unwrap_or(file);
    Some(format!("{basename}:{}", loc.line()))
}

fn stderr_line(message: &str) {
    let mut stderr = std::io::stderr().lock();
    let _ = writeln!(stderr, "{message}");
}

impl Logger {
    #[track_caller]
    pub fn log(&self, message: impl Into<String>) {
        let location = caller_location();
        self.write(LogLevel::Info, message.into(), None, location);
    }

    #[track_caller]
    pub fn debug(&self, message: impl Into<String>) {
        let location = caller_location();
        self.write(LogLevel::Debug, message.into(), None, location);
    }

    #[track_caller]
    pub fn info(&self, message: impl Into<String>) {
        let location = caller_location();
        self.write(LogLevel::Info, message.into(), None, location);
    }

    #[track_caller]
    pub fn warn(&self, message: impl Into<String>) {
        let location = caller_location();
        self.write(LogLevel::Warn, message.into(), None, location);
    }

    #[track_caller]
    pub fn error(&self, message: impl Into<String>) {
        let location = caller_location();
        self.write(LogLevel::Error, message.into(), None, location);
    }

    #[track_caller]
    pub fn critical(&self, message: impl Into<String>) {
        let location = caller_location();
        self.write(LogLevel::Critical, message.into(), None, location);
    }

    #[track_caller]
    pub fn debug_with(&self, message: impl Into<String>, meta: LogMeta) {
        let location = caller_location();
        self.write(LogLevel::Debug, message.into(), Some(meta), location);
    }

    #[track_caller]
    pub fn info_with(&self, message: impl Into<String>, meta: LogMeta) {
        let location = caller_location();
        self.write(LogLevel::Info, message.into(), Some(meta), location);
    }

    #[track_caller]
    pub fn warn_with(&self, message: impl Into<String>, meta: LogMeta) {
        let location = caller_location();
        self.write(LogLevel::Warn, message.into(), Some(meta), location);
    }

    #[track_caller]
    pub fn error_with(&self, message: impl Into<String>, meta: LogMeta) {
        let location = caller_location();
        self.write(LogLevel::Error, message.into(), Some(meta), location);
    }

    #[track_caller]
    pub fn critical_with(&self, message: impl Into<String>, meta: LogMeta) {
        let location = caller_location();
        self.write(LogLevel::Critical, message.into(), Some(meta), location);
    }

    /// The module name bound to this logger instance.
    pub fn module(&self) -> &str {
        &self.inner.module
    }

    /// Dispose all sinks. Call on shutdown.
    pub fn dispose(&self) {
        for sink in &self.inner.sinks {
            let _ = catch_unwind(AssertUnwindSafe(|| sink.dispose()));
        }
    }

    fn write(
        &self,
        level: LogLevel,
        message: String,
        meta: Option<LogMeta>,
        location: Option<String>,
    ) {
        if !should_log(level, resolve_level(self.inner.explicit_level)) {
            return;
        }

        let entry = build_entry(level, &self.inner.module, message, meta.as_ref(), location);

        // Redact first, always.
        let clean = LogEntry {
            data: redact_data(entry.data.clone(), &self.inner.patterns),
            ..entry
        };

        let mut disabled = self
            .inner
            .disabled
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        for (index, sink) in self.inner.sinks.iter().enumerate() {
            if disabled.contains(&index) {
                continue;
            }
            let result = catch_unwind(AssertUnwindSafe(|| sink.write(&clean)));
            if result.is_err() {
                disabled.insert(index);
                stderr_line(&format!(
                    "[logger/{}] sink failed: sink panicked",
                    self.inner.module
                ));
            }
        }
        drop(disabled);
    }
}

// ---- Internals ----

fn build_entry(
    level: LogLevel,
    module: &str,
    message: String,
    meta: Option<&LogMeta>,
    location: Option<String>,
) -> LogEntry {
    let (trace_id, operation, data, error) = match meta {
        Some(meta) => (
            meta.trace_id.clone(),
            meta.operation.clone(),
            meta.data.clone(),
            meta.error.clone(),
        ),
        None => (None, None, None, None),
    };
    LogEntry {
        timestamp: timestamp_now(),
        level,
        module: module.to_string(),
        message,
        location,
        trace_id,
        operation,
        data,
        error,
    }
}
