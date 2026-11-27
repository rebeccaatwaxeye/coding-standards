//! Formatters shared by the sinks (§14.5). Byte-for-byte identical to
//! `@nocturna/logger`'s formats — the parity fixtures in the tests of every
//! language's package assert this.

use crate::types::{LogEntry, LogError};

// ---- Level presentation ----

pub fn level_icon(level: &str) -> &'static str {
    match level {
        "DEBUG" => "\u{1f41b}",       // 🐛
        "INFO" => "\u{2139}\u{fe0f}", // ℹ️
        "WARN" => "\u{26a0}\u{fe0f}", // ⚠️
        "ERROR" => "\u{274c}",        // ❌
        "CRITICAL" => "\u{1f525}",    // 🔥
        _ => "",
    }
}

pub fn level_ansi(level: &str) -> &'static str {
    match level {
        "DEBUG" => "\x1b[36m",    // cyan
        "INFO" => "\x1b[32m",     // green
        "WARN" => "\x1b[33m",     // yellow
        "ERROR" => "\x1b[31m",    // red
        "CRITICAL" => "\x1b[35m", // magenta
        _ => "",
    }
}

const RESET: &str = "\x1b[0m";
const DIM: &str = "\x1b[2m";
const BOLD: &str = "\x1b[1m";
const LEVEL_PAD: usize = 8; // widest is "CRITICAL" = 8 chars

fn location_prefix(entry: &LogEntry) -> String {
    match &entry.location {
        Some(loc) => format!("/{}", loc),
        None => String::new(),
    }
}

/// ` {traceId=x, op=y, error=z}` suffix — the fixed order mirrors TS.
fn build_meta_suffix(entry: &LogEntry) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(trace_id) = &entry.trace_id {
        parts.push(format!("traceId={trace_id}"));
    }
    if let Some(op) = &entry.operation {
        parts.push(format!("op={op}"));
    }
    if let Some(error) = &entry.error {
        parts.push(format!("error={}", error.message));
    }
    if parts.is_empty() {
        String::new()
    } else {
        format!(" {{{}}}", parts.join(", "))
    }
}

/// Plain-text format for file sinks.
/// Format: `[2026-08-29 14:05:32] [ERROR  ] [module/file:line] message {meta}`
pub fn format_plain_text(entry: &LogEntry) -> String {
    let level = entry.level.padded();
    let tag = format!("{}{}", entry.module, location_prefix(entry));
    let meta = build_meta_suffix(entry);
    format!(
        "[{}] [{}] [{}] {}{}\n",
        entry.timestamp, level, tag, entry.message, meta
    )
}

/// One-liner JSON format for structured output (containers, log aggregators).
/// Each line is a complete JSON object — safe for log streaming.
/// Key order is fixed: ts, level, module, msg, loc, traceId, op, data, error.
pub fn format_json(entry: &LogEntry) -> String {
    let mut obj = serde_json::Map::new();
    obj.insert("ts".into(), serde_json::json!(entry.timestamp));
    obj.insert("level".into(), serde_json::json!(entry.level.as_str()));
    obj.insert("module".into(), serde_json::json!(entry.module));
    obj.insert("msg".into(), serde_json::json!(entry.message));
    if let Some(loc) = &entry.location {
        obj.insert("loc".into(), serde_json::json!(loc));
    }
    if let Some(trace_id) = &entry.trace_id {
        obj.insert("traceId".into(), serde_json::json!(trace_id));
    }
    if let Some(op) = &entry.operation {
        obj.insert("op".into(), serde_json::json!(op));
    }
    if let Some(data) = &entry.data {
        obj.insert("data".into(), data.clone());
    }
    if let Some(error) = &entry.error {
        obj.insert("error".into(), error_json(error));
    }
    format!("{}\n", serde_json::Value::Object(obj))
}

fn error_json(error: &LogError) -> serde_json::Value {
    let mut obj = serde_json::Map::new();
    obj.insert("name".into(), serde_json::json!(error.name));
    obj.insert("message".into(), serde_json::json!(error.message));
    if let Some(stack) = &error.stack {
        obj.insert("stack".into(), serde_json::json!(stack));
    }
    if let Some(code) = &error.code {
        obj.insert("code".into(), serde_json::json!(code));
    }
    serde_json::Value::Object(obj)
}

/// ANSI-formatted console line (terminal).
/// `[01-02-2026 14:05:32] 🔥 CRITICAL [module/file:12] message`
pub fn format_ansi(entry: &LogEntry) -> String {
    let icon = level_icon(entry.level.as_str());
    let ansi_level = level_ansi(entry.level.as_str());
    let location = location_prefix(entry);
    let meta = build_meta_suffix(entry);
    format!(
        "{DIM}[{ts}]{RESET} {ansi}{BOLD}{icon} {level:<width$}{RESET} {BOLD}{module}{location}{RESET} {message}{meta}\n",
        ts = entry.timestamp,
        ansi = ansi_level,
        icon = icon,
        level = entry.level.as_str(),
        width = LEVEL_PAD,
        module = entry.module,
        message = entry.message,
    )
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use crate::types::LogLevel;
    use serde_json::json;

    fn make_entry(level: LogLevel) -> LogEntry {
        LogEntry {
            timestamp: "01-02-2026 14:05:32".into(),
            level,
            module: "api".into(),
            message: "server listening".into(),
            location: None,
            trace_id: None,
            operation: None,
            data: None,
            error: None,
        }
    }

    #[test]
    fn plain_text_formats_timestamp_padded_level_tag_message() {
        let mut entry = make_entry(LogLevel::Info);
        entry.location = Some("server.rs:42".into());
        assert_eq!(
            format_plain_text(&entry),
            "[01-02-2026 14:05:32] [INFO    ] [api/server.rs:42] server listening\n"
        );
    }

    #[test]
    fn plain_text_pads_critical_to_eight_chars() {
        let entry = make_entry(LogLevel::Critical);
        assert!(format_plain_text(&entry).contains("[CRITICAL]"));
    }

    #[test]
    fn plain_text_omits_location_when_absent() {
        let entry = make_entry(LogLevel::Info);
        assert_eq!(
            format_plain_text(&entry),
            "[01-02-2026 14:05:32] [INFO    ] [api] server listening\n"
        );
    }

    #[test]
    fn plain_text_appends_meta_suffix() {
        let mut entry = make_entry(LogLevel::Info);
        entry.trace_id = Some("abc".into());
        entry.operation = Some("boot".into());
        entry.error = Some(LogError {
            name: "Error".into(),
            message: "boom".into(),
            stack: None,
            code: None,
        });
        let line = format_plain_text(&entry);
        assert!(line
            .trim_end()
            .ends_with("{traceId=abc, op=boot, error=boom}"));
    }

    #[test]
    fn json_emits_core_fields_in_fixed_order() {
        let entry = make_entry(LogLevel::Info);
        let line = format_json(&entry);
        assert!(line.ends_with('\n'));
        let value: serde_json::Value = serde_json::from_str(line.trim_end()).unwrap();
        assert_eq!(value["ts"], json!("01-02-2026 14:05:32"));
        assert_eq!(value["level"], json!("INFO"));
        assert_eq!(value["module"], json!("api"));
        assert_eq!(value["msg"], json!("server listening"));
        // key order is the parity contract
        let keys: Vec<String> = value.as_object().unwrap().keys().cloned().collect();
        assert_eq!(keys, vec!["ts", "level", "module", "msg"]);
    }

    #[test]
    fn json_omits_optional_fields_when_absent() {
        let value: serde_json::Value =
            serde_json::from_str(format_json(&make_entry(LogLevel::Info)).trim_end()).unwrap();
        assert!(value.get("loc").is_none());
        assert!(value.get("traceId").is_none());
        assert!(value.get("op").is_none());
        assert!(value.get("data").is_none());
        assert!(value.get("error").is_none());
    }

    #[test]
    fn json_includes_optional_fields_when_present() {
        let mut entry = make_entry(LogLevel::Error);
        entry.location = Some("a.rs:1".into());
        entry.trace_id = Some("t1".into());
        entry.operation = Some("op1".into());
        entry.data = Some(json!({"x": 1}));
        entry.error = Some(LogError {
            name: "Error".into(),
            message: "boom".into(),
            stack: None,
            code: None,
        });
        let value: serde_json::Value =
            serde_json::from_str(format_json(&entry).trim_end()).unwrap();
        assert_eq!(value["loc"], json!("a.rs:1"));
        assert_eq!(value["traceId"], json!("t1"));
        assert_eq!(value["op"], json!("op1"));
        assert_eq!(value["data"], json!({"x": 1}));
        assert_eq!(value["error"], json!({"name": "Error", "message": "boom"}));
    }

    #[test]
    fn ansi_wraps_timestamp_in_dim_codes() {
        let line = format_ansi(&make_entry(LogLevel::Info));
        assert!(line.contains("\x1b[2m[01-02-2026 14:05:32]\x1b[0m"));
    }

    #[test]
    fn ansi_maps_each_level_to_colour_and_icon() {
        let cases: Vec<(LogLevel, &str, &str)> = vec![
            (LogLevel::Debug, "\x1b[36m", "\u{1f41b}"),
            (LogLevel::Info, "\x1b[32m", "\u{2139}\u{fe0f}"),
            (LogLevel::Warn, "\x1b[33m", "\u{26a0}\u{fe0f}"),
            (LogLevel::Error, "\x1b[31m", "\u{274c}"),
            (LogLevel::Critical, "\x1b[35m", "\u{1f525}"),
        ];
        for (level, ansi, icon) in cases {
            let line = format_ansi(&make_entry(level));
            assert!(line.contains(ansi), "missing {ansi} for {}", level.as_str());
            assert!(line.contains(icon), "missing {icon} for {}", level.as_str());
        }
    }

    #[test]
    fn ansi_bolds_the_module_tag() {
        let mut entry = make_entry(LogLevel::Info);
        entry.location = Some("a.rs:9".into());
        let line = format_ansi(&entry);
        assert!(line.contains("\x1b[1mapi/a.rs:9\x1b[0m"));
    }
}
