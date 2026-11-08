//! Level resolution and filtering (§14.1–14.2).
//!
//! Priority:
//!  1. Explicit `level` parameter (from `LoggerOptions`)
//!  2. `LOG_LEVEL` env var (case-insensitive, invalid values ignored)
//!  3. Environment detection: dev → DEBUG, prod → ERROR, test → SILENT

use crate::types::LogLevel;

/// Resolve the effective log level from explicit param → env var → environment detection.
pub fn resolve_level(explicit: Option<LogLevel>) -> LogLevel {
    if let Some(level) = explicit {
        return level;
    }

    if let Some(level) = env_level() {
        return level;
    }

    if is_test() {
        LogLevel::Silent
    } else if is_dev() {
        LogLevel::Debug
    } else {
        LogLevel::Error
    }
}

/// Returns true if `entry` should be emitted given `minimum`.
///
/// SILENT is a disable switch, not a point on the severity scale — it suppresses
/// everything regardless of numeric ordering. (Its value of 0 would otherwise let
/// every entry through a `>=` comparison, which is the opposite of the intent.)
pub fn should_log(entry: LogLevel, minimum: LogLevel) -> bool {
    if minimum == LogLevel::Silent || entry == LogLevel::Silent {
        return false;
    }
    entry.value() >= minimum.value()
}

fn env_var(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.is_empty())
}

fn env_level() -> Option<LogLevel> {
    env_var("LOG_LEVEL").and_then(|raw| LogLevel::parse(&raw))
}

fn is_dev() -> bool {
    env_var("NODE_ENV").as_deref() == Some("development")
        || env_var("DEV").as_deref() == Some("true")
}

fn is_test() -> bool {
    env_var("NODE_ENV").as_deref() == Some("test")
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    fn clear_env() {
        std::env::remove_var("LOG_LEVEL");
        std::env::remove_var("NODE_ENV");
        std::env::remove_var("DEV");
    }

    /// All env scenarios run in one test: parallel tests share process env.
    #[test]
    fn env_detection_matrix() {
        clear_env();

        // production default
        assert_eq!(resolve_level(None), LogLevel::Error);

        // dev signals
        std::env::set_var("NODE_ENV", "development");
        assert_eq!(resolve_level(None), LogLevel::Debug);
        std::env::remove_var("NODE_ENV");
        std::env::set_var("DEV", "true");
        assert_eq!(resolve_level(None), LogLevel::Debug);
        std::env::remove_var("DEV");

        // test → SILENT
        std::env::set_var("NODE_ENV", "test");
        assert_eq!(resolve_level(None), LogLevel::Silent);
        std::env::remove_var("NODE_ENV");

        // LOG_LEVEL overrides detection, case-insensitive
        std::env::set_var("NODE_ENV", "test");
        std::env::set_var("LOG_LEVEL", "warn");
        assert_eq!(resolve_level(None), LogLevel::Warn);
        std::env::remove_var("NODE_ENV");

        // invalid LOG_LEVEL is ignored → falls back to detection
        std::env::set_var("LOG_LEVEL", "garbage");
        assert_eq!(resolve_level(None), LogLevel::Error);
        std::env::remove_var("LOG_LEVEL");

        // explicit beats everything
        assert_eq!(resolve_level(Some(LogLevel::Info)), LogLevel::Info);
    }

    #[test]
    fn should_log_semantics() {
        // SILENT is a disable switch, not a point on the severity scale.
        assert!(!should_log(LogLevel::Info, LogLevel::Silent));
        assert!(!should_log(LogLevel::Silent, LogLevel::Debug));
        assert!(!should_log(LogLevel::Debug, LogLevel::Error));
        assert!(should_log(LogLevel::Error, LogLevel::Error));
        assert!(should_log(LogLevel::Critical, LogLevel::Error));
        assert!(should_log(LogLevel::Debug, LogLevel::Debug));
    }
}
