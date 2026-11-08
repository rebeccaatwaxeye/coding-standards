//! Console sink — ANSI-coloured output (terminal).
//!
//! ERROR and CRITICAL go to stderr; everything else to stdout.
//! This is the default sink when none is provided.
//! Output is byte-identical to `@nocturna/logger`'s console sink.

use crate::format::format_ansi;
use crate::types::{LogEntry, LogLevel, Sink};
use std::io::Write;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Stream {
    Stdout,
    Stderr,
}

/// ERROR and CRITICAL → stderr; everything else → stdout.
fn stream_for(level: LogLevel) -> Stream {
    match level {
        LogLevel::Error | LogLevel::Critical => Stream::Stderr,
        _ => Stream::Stdout,
    }
}

#[derive(Debug, Default)]
pub struct ConsoleSink;

impl Sink for ConsoleSink {
    fn write(&self, entry: &LogEntry) {
        let line = format_ansi(entry);
        match stream_for(entry.level) {
            Stream::Stderr => {
                let mut out = std::io::stderr().lock();
                let _ = out.write_all(line.as_bytes());
            }
            Stream::Stdout => {
                let mut out = std::io::stdout().lock();
                let _ = out.write_all(line.as_bytes());
            }
        }
    }
}

/// Create the console sink. This is the default sink when none is provided.
pub fn console_sink() -> Arc<dyn Sink> {
    Arc::new(ConsoleSink)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_and_critical_route_to_stderr() {
        assert_eq!(stream_for(LogLevel::Error), Stream::Stderr);
        assert_eq!(stream_for(LogLevel::Critical), Stream::Stderr);
    }

    #[test]
    fn debug_info_warn_route_to_stdout() {
        assert_eq!(stream_for(LogLevel::Debug), Stream::Stdout);
        assert_eq!(stream_for(LogLevel::Info), Stream::Stdout);
        assert_eq!(stream_for(LogLevel::Warn), Stream::Stdout);
    }
}
