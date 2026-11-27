//! `nocturna-logger` — zero-config structured logger for Rust.
//!
//! Rust reference implementation of the Nocturna logging spec (§14).
//! Produces byte-identical output to `@nocturna/logger`: same levels,
//! thresholds, redaction, formats, rotation and retention.
//!
//! ```no_run
//! use nocturna_logger::{console_sink, create_logger, file_sink, LoggerOptions, LogMeta};
//!
//! let log = create_logger(
//!     LoggerOptions::new("worker")
//!         .sink(console_sink())
//!         .sink(file_sink(Default::default())),
//! );
//!
//! log.info("job started");
//! log.error_with(
//!     "payment failed",
//!     LogMeta {
//!         operation: Some("processOrder".into()),
//!         ..Default::default()
//!     },
//! );
//! ```

mod format;
mod global_handlers;
mod levels;
mod logger;
mod redact;
mod sinks;
mod types;

pub use format::{format_ansi, format_json, format_plain_text};
pub use global_handlers::install_global_handlers;
pub use levels::{resolve_level, should_log};
pub use logger::{create_logger, Logger, LoggerOptions};
pub use redact::{build_patterns, redact_data};
pub use sinks::{console_sink, file_sink, json_sink, FileSinkOptions, JsonSinkOptions};
pub use types::{LogEntry, LogError, LogLevel, LogMeta, SharedSink, Sink};
