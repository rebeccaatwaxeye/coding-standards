//! §14.8 — Global error handler for CLI processes: fail loud at the edge.
//!
//! Installs a panic hook that logs at CRITICAL and exits non-zero.
//! A process that cannot honour its invariants should die loudly
//! and be restarted by the supervisor — not limp along in an unknown state.

use crate::logger::Logger;
use crate::types::{LogError, LogMeta};
use std::io::Write;
use std::sync::Arc;

/// Install the global panic handler. Call once at the top of `main()`.
pub fn install_global_handlers(logger: &Logger) {
    let logger = Arc::new(logger.clone());
    std::panic::set_hook(Box::new(move |info| {
        let message = payload_message(info);
        let backtrace = std::backtrace::Backtrace::force_capture().to_string();
        let error = LogError {
            name: "Panic".into(),
            message,
            stack: if backtrace.is_empty() {
                None
            } else {
                Some(backtrace)
            },
            code: None,
        };
        logger.critical_with(
            "Uncaught panic — process cannot continue",
            LogMeta {
                error: Some(error),
                data: Some(serde_json::json!({"type": "panic"})),
                ..Default::default()
            },
        );
        // Give sinks time to flush to file before exiting (mirrors TS: 200ms)
        std::thread::sleep(std::time::Duration::from_millis(200));
        std::process::exit(1);
    }));
}

fn payload_message(info: &std::panic::PanicHookInfo<'_>) -> String {
    let payload = info.payload();
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        let mut stderr = std::io::stderr().lock();
        let _ = writeln!(stderr, "[logger] panic payload of unexpected type");
        "panic payload of unexpected type".into()
    }
}
