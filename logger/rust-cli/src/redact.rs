//! Mandatory redaction — runs before every sink, always on, cannot be disabled.
//!
//! Default patterns (case-insensitive, applied recursively to any object or
//! `meta.data`) mirror `@nocturna/logger` exactly:
//!   token, password, passwd, pwd, secret, credential, authorization, bearer,
//!   api[_-]?key, apikey, access[_-]?key, private[_-]?key, cookie, session, jwt, otp
//!
//! Redacted values become `[REDACTED]` — never truncated-but-partial.
//! Redaction is by KEY: plain string values are never redacted directly.

use regex::Regex;
use serde_json::Value as JsonValue;

/// The default redaction patterns, byte-for-byte identical to the
/// TypeScript reference implementation.
#[allow(clippy::expect_used)] // static patterns cannot fail to compile
pub fn default_patterns() -> Vec<Regex> {
    [
        r"token",
        r"password",
        r"passwd",
        r"pwd",
        r"secret",
        r"credential",
        r"authorization",
        r"bearer",
        r"api[_-]?key",
        r"apikey",
        r"access[_-]?key",
        r"private[_-]?key",
        r"cookie",
        r"session",
        r"jwt",
        r"otp",
    ]
    .iter()
    .map(|p| Regex::new(&format!("(?i){p}")).expect("static regex"))
    .collect()
}

/// Build the combined list of patterns from defaults + user overrides.
/// Additional string patterns are case-insensitive.
pub fn build_patterns(additional: &[String], include_defaults: bool) -> Vec<Regex> {
    let base = if include_defaults {
        default_patterns()
    } else {
        Vec::new()
    };
    let mut patterns = base;
    for p in additional {
        if let Ok(re) = Regex::new(&format!("(?i){p}")) {
            patterns.push(re);
        }
    }
    patterns
}

fn key_is_sensitive(key: &str, patterns: &[Regex]) -> bool {
    patterns.iter().any(|p| p.is_match(key))
}

/// Deep-redact a JSON value. Objects whose key matches a pattern get their
/// value replaced with `[REDACTED]`. Nested objects and arrays are traversed
/// recursively. Strings are never redacted directly — only by key.
pub fn redact_value(value: &JsonValue, patterns: &[Regex]) -> JsonValue {
    match value {
        JsonValue::Null => JsonValue::Null,
        JsonValue::String(s) => JsonValue::String(s.clone()),
        JsonValue::Array(items) => {
            JsonValue::Array(items.iter().map(|i| redact_value(i, patterns)).collect())
        }
        JsonValue::Object(map) => {
            let mut out = serde_json::Map::new();
            for (key, val) in map {
                if key_is_sensitive(key, patterns) {
                    out.insert(key.clone(), JsonValue::String("[REDACTED]".into()));
                } else {
                    out.insert(key.clone(), redact_value(val, patterns));
                }
            }
            JsonValue::Object(out)
        }
        // numbers, booleans — pass through
        other => other.clone(),
    }
}

/// Redact an entry's `data` field. Returns the new value (does not mutate).
/// The `error` field needs no redaction: it is a fixed `{name, message,
/// stack, code}` struct with no free-form keys.
pub fn redact_data(data: Option<JsonValue>, patterns: &[Regex]) -> Option<JsonValue> {
    data.map(|d| redact_value(&d, patterns))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use serde_json::json;

    fn patterns() -> Vec<Regex> {
        build_patterns(&[], true)
    }

    #[test]
    fn defaults_include_password() {
        let patterns = patterns();
        assert!(!patterns.is_empty());
        assert!(patterns.iter().any(|p| p.is_match("password")));
    }

    #[test]
    fn appends_custom_patterns_case_insensitively() {
        let patterns = build_patterns(&["internal_id".into()], true);
        assert!(patterns.iter().any(|p| p.is_match("INTERNAL_ID")));
    }

    #[test]
    fn can_omit_defaults() {
        let patterns = build_patterns(&["custom".into()], false);
        assert!(patterns.iter().any(|p| p.is_match("custom")));
        assert!(!patterns.iter().any(|p| p.is_match("password")));
    }

    #[test]
    fn redacts_known_sensitive_keys() {
        let value = json!({"password": "hunter2", "user": "alice"});
        let out = redact_value(&value, &patterns());
        assert_eq!(out, json!({"password": "[REDACTED]", "user": "alice"}));
    }

    #[test]
    fn redacts_keys_case_insensitively() {
        let value = json!({"API_KEY": "abc", "ApiKey": "def", "apikey": "ghi"});
        let out = redact_value(&value, &patterns());
        assert_eq!(
            out,
            json!({
                "API_KEY": "[REDACTED]",
                "ApiKey": "[REDACTED]",
                "apikey": "[REDACTED]"
            })
        );
    }

    #[test]
    fn redacts_nested_objects_recursively() {
        let value = json!({
            "request": {
                "headers": {
                    "authorization": "Bearer xyz",
                    "content-type": "application/json"
                }
            }
        });
        let out = redact_value(&value, &patterns());
        assert_eq!(
            out,
            json!({
                "request": {
                    "headers": {
                        "authorization": "[REDACTED]",
                        "content-type": "application/json"
                    }
                }
            })
        );
    }

    #[test]
    fn redacts_inside_arrays() {
        let value = json!({"users": [{"token": "a"}, {"token": "b"}]});
        let out = redact_value(&value, &patterns());
        assert_eq!(
            out,
            json!({"users": [{"token": "[REDACTED]"}, {"token": "[REDACTED]"}]})
        );
    }

    #[test]
    fn preserves_non_sensitive_data() {
        let value = json!({"orderId": 42, "status": "ok", "nested": {"a": 1}});
        let out = redact_value(&value, &patterns());
        assert_eq!(out, value);
    }

    #[test]
    fn passes_primitives_through() {
        assert_eq!(
            redact_value(&json!("plain string"), &patterns()),
            json!("plain string")
        );
        assert_eq!(redact_value(&json!(42), &patterns()), json!(42));
        assert_eq!(redact_value(&json!(null), &patterns()), json!(null));
    }
}
