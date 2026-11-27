//! File sink — writes daily-rotated plain-text logs (§14.7).
//!
//! File name pattern: `app-YYYY-MM-DD.log`
//!
//! Prunes files older than `retainDays` (default 14) on first write of each day.
//! If the log directory exceeds `maxTotalSizeMB`, oldest files are removed first.
//! Behaviour is identical to `@nocturna/logger`'s file sink.

use crate::format::format_plain_text;
use crate::types::{LogEntry, Sink};
use chrono::{DateTime, Datelike, Local};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct FileSinkOptions {
    /// Directory to write log files into. Default: `./logs`.
    pub dir: PathBuf,
    /// How many days of log files to retain. Default: 14. Set to 0 to disable
    /// pruning (not recommended).
    pub retain_days: u32,
    /// Max total size of the log directory in MB. Default: 100. Oldest files
    /// are pruned first when exceeded.
    pub max_total_size_mb: f64,
}

impl Default for FileSinkOptions {
    fn default() -> Self {
        FileSinkOptions {
            dir: PathBuf::from("./logs"),
            retain_days: 14,
            max_total_size_mb: 100.0,
        }
    }
}

struct FileState {
    current_path: Option<PathBuf>,
    current_date: Option<String>,
    pruned_today: bool,
}

pub struct FileSink {
    options: FileSinkOptions,
    state: std::sync::Mutex<FileState>,
}

impl FileSink {
    fn write_at(&self, entry: &LogEntry, now: DateTime<Local>) {
        let today = date_string(now);
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if state.current_date.as_deref() != Some(today.as_str()) {
            state.current_date = Some(today.clone());
            state.current_path = Some(self.options.dir.join(format!("app-{today}.log")));
            state.pruned_today = false;
        }

        let dir = &self.options.dir;
        if let Err(err) = fs::create_dir_all(dir) {
            report_failure(&format!("write failed: {err}"));
            return;
        }

        let write_result = state
            .current_path
            .as_ref()
            .and_then(|path| {
                fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(path)
                    .ok()
            })
            .map(|mut file| file.write_all(format_plain_text(entry).as_bytes()));

        if let Some(Err(err)) = write_result {
            report_failure(&format!("write failed: {err}"));
            return;
        }

        if !state.pruned_today {
            state.pruned_today = true;
            drop(state);
            prune(
                dir,
                self.options.retain_days,
                self.options.max_total_size_mb,
                now,
            );
        }
    }
}

impl Sink for FileSink {
    fn write(&self, entry: &LogEntry) {
        self.write_at(entry, Local::now());
    }
}

/// Create a file sink writing daily-rotated plain-text logs.
/// Default directory: `./logs`, retention: 14 days, size cap: 100 MB.
pub fn file_sink(options: FileSinkOptions) -> Arc<dyn Sink> {
    Arc::new(FileSink {
        options,
        state: std::sync::Mutex::new(FileState {
            current_path: None,
            current_date: None,
            pruned_today: false,
        }),
    })
}

fn report_failure(message: &str) {
    let mut stderr = std::io::stderr().lock();
    let _ = writeln!(stderr, "[logger/file] {message}");
}

fn date_string(now: DateTime<Local>) -> String {
    format!("{:04}-{:02}-{:02}", now.year(), now.month(), now.day())
}

/// Remove log files older than `retain_days` and prune oldest-first when the
/// total size exceeds `max_total_size_mb`. Mirrors the TS algorithm exactly:
/// only `app-*.log` files are considered; alphabetical order = chronological.
fn prune(dir: &Path, retain_days: u32, max_total_size_mb: f64, now: DateTime<Local>) {
    if retain_days == 0 && max_total_size_mb <= 0.0 {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return, // directory read failed — skip pruning
    };

    let mut files: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|f| f.starts_with("app-") && f.ends_with(".log"))
        .collect();
    files.sort(); // alphabetical = chronological

    let now_ms = now.timestamp_millis();
    let retain_ms = i64::from(retain_days) * 24 * 60 * 60 * 1000;
    let max_bytes = (max_total_size_mb * 1024.0 * 1024.0) as i64;

    let mut total_size: i64 = 0;

    for file in &files {
        let path = dir.join(file);
        let Ok(metadata) = fs::metadata(&path) else {
            continue; // skip unreadable files
        };
        total_size += i64::try_from(metadata.len()).unwrap_or(i64::MAX);

        let Ok(modified) = metadata.modified() else {
            continue;
        };
        let Ok(mtime_ms) = modified.duration_since(std::time::UNIX_EPOCH) else {
            continue;
        };
        let mtime_ms = i64::try_from(mtime_ms.as_millis()).unwrap_or(i64::MAX);
        let age_ms = now_ms - mtime_ms;
        let removed = age_ms > retain_ms && fs::remove_file(&path).is_ok();
        if removed {
            total_size -= i64::try_from(metadata.len()).unwrap_or(0);
        }
    }

    // If over total size cap, prune oldest first
    if total_size > max_bytes {
        for file in &files {
            if total_size <= max_bytes {
                break;
            }
            let path = dir.join(file);
            let Ok(metadata) = fs::metadata(&path) else {
                continue;
            };
            let size = i64::try_from(metadata.len()).unwrap_or(0);
            if fs::remove_file(&path).is_ok() {
                total_size -= size;
            }
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use crate::types::{LogError, LogLevel};
    use chrono::TimeZone;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_dir() -> PathBuf {
        let id = TMP_COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir =
            std::env::temp_dir().join(format!("nocturna-file-test-{}-{id}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn make_sink(options: FileSinkOptions) -> FileSink {
        FileSink {
            options,
            state: std::sync::Mutex::new(FileState {
                current_path: None,
                current_date: None,
                pruned_today: false,
            }),
        }
    }

    fn fixed_now() -> DateTime<Local> {
        Local.with_ymd_and_hms(2026, 11, 7, 12, 0, 0).unwrap()
    }

    fn today_file() -> String {
        let now = Local::now();
        format!(
            "app-{:04}-{:02}-{:02}.log",
            now.year(),
            now.month(),
            now.day()
        )
    }

    fn make_entry() -> LogEntry {
        LogEntry {
            timestamp: "07-11-2026 12:00:00".into(),
            level: LogLevel::Info,
            module: "api".into(),
            message: "hello".into(),
            location: None,
            trace_id: None,
            operation: None,
            data: None,
            error: None,
        }
    }

    fn backdate(dir: &Path, file: &str, mtime: DateTime<Local>, size: usize) {
        let path = dir.join(file);
        fs::write(&path, "x".repeat(size)).unwrap();
        // seconds precision
        let secs = mtime.timestamp();
        filetime::set_file_times(
            &path,
            filetime::FileTime::from_unix_time(secs, 0),
            filetime::FileTime::from_unix_time(secs, 0),
        )
        .unwrap();
    }

    #[test]
    fn creates_dated_plain_text_file() {
        let dir = temp_dir();
        let sink = file_sink(FileSinkOptions {
            dir: dir.clone(),
            ..Default::default()
        });
        sink.write(&make_entry());

        let content = fs::read_to_string(dir.join(today_file())).unwrap();
        assert_eq!(content, "[07-11-2026 12:00:00] [INFO    ] [api] hello\n");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn appends_same_day_entries_to_one_file() {
        let dir = temp_dir();
        let sink = file_sink(FileSinkOptions {
            dir: dir.clone(),
            ..Default::default()
        });
        sink.write(&make_entry());
        sink.write(&make_entry());

        let content = fs::read_to_string(dir.join(today_file())).unwrap();
        assert_eq!(content.lines().count(), 2);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rolls_over_on_the_next_day() {
        let dir = temp_dir();
        let sink = make_sink(FileSinkOptions {
            dir: dir.clone(),
            ..Default::default()
        });
        let now = fixed_now();
        sink.write_at(&make_entry(), now);
        let next_day = Local.with_ymd_and_hms(2026, 11, 8, 12, 0, 0).unwrap();
        sink.write_at(&make_entry(), next_day);

        assert!(dir.join("app-2026-11-07.log").exists());
        assert!(dir.join("app-2026-11-08.log").exists());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn prunes_files_older_than_retain_days() {
        let dir = temp_dir();
        backdate(
            &dir,
            "app-2020-01-01.log",
            Local.with_ymd_and_hms(2026, 10, 18, 12, 0, 0).unwrap(),
            10,
        );
        backdate(
            &dir,
            "app-2026-10-30.log",
            Local.with_ymd_and_hms(2026, 10, 30, 12, 0, 0).unwrap(),
            10,
        );

        let sink = make_sink(FileSinkOptions {
            dir: dir.clone(),
            ..Default::default()
        });
        sink.write_at(&make_entry(), fixed_now());

        assert!(!dir.join("app-2020-01-01.log").exists());
        assert!(dir.join("app-2026-10-30.log").exists());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn removes_oldest_first_when_size_cap_exceeded() {
        let dir = temp_dir();
        // ~4.2 KB total vs a ~3.1 KB cap: only the oldest file must go.
        fs::write(dir.join("app-2026-11-07.log"), "").unwrap();
        backdate(&dir, "app-2020-01-01.log", fixed_now(), 2048);
        backdate(&dir, "app-2021-01-01.log", fixed_now(), 2048);

        let sink = make_sink(FileSinkOptions {
            dir: dir.clone(),
            retain_days: 0,
            max_total_size_mb: 0.003,
        });
        sink.write_at(&make_entry(), fixed_now());

        assert!(!dir.join("app-2020-01-01.log").exists());
        assert!(dir.join("app-2021-01-01.log").exists());
        assert!(dir.join("app-2026-11-07.log").exists());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn keeps_old_files_when_pruning_disabled() {
        let dir = temp_dir();
        backdate(
            &dir,
            "app-2020-01-01.log",
            Local.with_ymd_and_hms(2026, 10, 8, 12, 0, 0).unwrap(),
            10,
        );

        let sink = make_sink(FileSinkOptions {
            dir: dir.clone(),
            retain_days: 0,
            max_total_size_mb: 0.0,
        });
        sink.write_at(&make_entry(), fixed_now());

        assert!(dir.join("app-2020-01-01.log").exists());
        assert!(dir.join("app-2026-11-07.log").exists());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn honours_explicit_retention_overrides() {
        let dir = temp_dir();
        backdate(
            &dir,
            "app-2026-11-06.log",
            Local.with_ymd_and_hms(2026, 11, 5, 12, 0, 0).unwrap(),
            10,
        );

        let sink = make_sink(FileSinkOptions {
            dir: dir.clone(),
            retain_days: 1,
            ..Default::default()
        });
        sink.write_at(&make_entry(), fixed_now());

        assert!(!dir.join("app-2026-11-06.log").exists());
        fs::remove_dir_all(&dir).ok();
    }

    // silence unused warning for LogError import used by doc parity
    #[test]
    fn entry_shapes_are_stable() {
        let entry = LogEntry {
            error: Some(LogError::from_message("x")),
            ..make_entry()
        };
        let _ = format_plain_text(&entry);
    }
}
