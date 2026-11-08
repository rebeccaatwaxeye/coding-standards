//! Structured JSON sink — one JSON object per line (JSONL).
//!
//! Use in containerised services where the platform collects logs
//! (Uptrace, Loki, Bugsink, CloudWatch, etc.).

use crate::format::format_json;
use crate::types::{LogEntry, Sink};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum JsonOutput {
    #[default]
    Stdout,
    File,
}

#[derive(Debug, Clone, Default)]
pub struct JsonSinkOptions {
    /// Output destination. Default: stdout.
    pub output: JsonOutput,
    /// File path when output is `File`. Default: `./logs/structured.jsonl`.
    pub file_path: Option<PathBuf>,
}

struct JsonFileSink {
    file_path: PathBuf,
}

impl Sink for JsonFileSink {
    fn write(&self, entry: &LogEntry) {
        if let Some(parent) = self.file_path.parent() {
            let _ = fs::create_dir_all(parent); // best effort — write reports failures
        }
        let result = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)
            .and_then(|mut file| file.write_all(format_json(entry).as_bytes()));
        if let Err(err) = result {
            let mut stderr = std::io::stderr().lock();
            let _ = writeln!(stderr, "[logger/json] write failed: {err}");
        }
    }
}

struct JsonStdoutSink;

impl Sink for JsonStdoutSink {
    fn write(&self, entry: &LogEntry) {
        let mut out = std::io::stdout().lock();
        let _ = out.write_all(format_json(entry).as_bytes());
    }
}

/// Structured JSON sink — one JSON object per line.
/// Default output: stdout. `JsonOutput::File` appends to
/// `./logs/structured.jsonl` unless a path is given.
pub fn json_sink(options: JsonSinkOptions) -> Arc<dyn Sink> {
    match options.output {
        JsonOutput::Stdout => Arc::new(JsonStdoutSink),
        JsonOutput::File => Arc::new(JsonFileSink {
            file_path: options
                .file_path
                .unwrap_or_else(|| PathBuf::from("./logs/structured.jsonl")),
        }),
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use crate::types::{LogEntry, LogLevel};
    use std::sync::atomic::{AtomicU64, Ordering};

    static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_path(name: &str) -> PathBuf {
        let id = TMP_COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir =
            std::env::temp_dir().join(format!("nocturna-json-test-{}-{id}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    fn make_entry(message: &str) -> LogEntry {
        LogEntry {
            timestamp: "01-02-2026 14:05:32".into(),
            level: LogLevel::Info,
            module: "api".into(),
            message: message.into(),
            location: None,
            trace_id: None,
            operation: None,
            data: None,
            error: None,
        }
    }

    #[test]
    fn file_mode_appends_jsonl_and_creates_parent_dirs() {
        let path = temp_path("nested/dir/structured.jsonl");
        let sink = json_sink(JsonSinkOptions {
            output: JsonOutput::File,
            file_path: Some(path.clone()),
        });

        sink.write(&make_entry("first"));
        sink.write(&make_entry("second"));

        let content = fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = content.trim_end().split('\n').collect();
        assert_eq!(lines.len(), 2);
        let first: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(first["module"], "api");
        assert_eq!(first["msg"], "first");
        fs::remove_dir_all(path.parent().unwrap().parent().unwrap()).ok();
    }

    #[test]
    fn file_mode_reports_failures_without_panicking() {
        let sink = json_sink(JsonSinkOptions {
            output: JsonOutput::File,
            file_path: Some(PathBuf::from("/proc/definitely/not/writable/x.jsonl")),
        });
        // must not panic — failure is reported to stderr
        sink.write(&make_entry("hello"));
    }

    #[test]
    fn stdout_sink_is_constructible_and_writes_without_panicking() {
        let sink = json_sink(JsonSinkOptions::default());
        sink.write(&make_entry("stdout line"));
    }
}
