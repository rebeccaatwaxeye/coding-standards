"""Mandatory redaction — runs before every sink, always on, cannot be disabled.

Default patterns (case-insensitive, applied recursively to any object or
``meta.data``) mirror ``@nocturna/logger`` exactly:
  token, password, passwd, pwd, secret, credential, authorization, bearer,
  api[_-]?key, apikey, access[_-]?key, private[_-]?key, cookie, session, jwt, otp

Redacted values become ``[REDACTED]`` — never truncated-but-partial.
Redaction is by KEY: plain string values are never redacted directly.
"""

import re
from re import Pattern
from typing import Any, Optional, Union

DEFAULT_PATTERN_SOURCES = [
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


def default_patterns() -> list[Pattern[str]]:
    return [re.compile(f"(?i){p}") for p in DEFAULT_PATTERN_SOURCES]


def build_patterns(
    additional: Optional[list[Union[str, Pattern[str]]]] = None,
    include_defaults: bool = True,
) -> list[Pattern[str]]:
    """Build the combined list of patterns from defaults + user overrides."""
    patterns: list[Pattern[str]] = default_patterns() if include_defaults else []
    for p in additional or []:
        if isinstance(p, str):
            patterns.append(re.compile(f"(?i){p}"))
        else:
            patterns.append(p)
    return patterns


def key_is_sensitive(key: str, patterns: list[Pattern[str]]) -> bool:
    return any(p.search(key) for p in patterns)


def redact_value(value: Any, patterns: list[Pattern[str]]) -> Any:
    """Deep-redact a value. Dicts whose key matches a pattern get their value
    replaced with ``[REDACTED]``. Nested dicts and lists are traversed
    recursively. Strings are never redacted directly — only by key.
    """
    if value is None or isinstance(value, str):
        return value
    if isinstance(value, list):
        return [redact_value(item, patterns) for item in value]
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, val in value.items():
            if key_is_sensitive(str(key), patterns):
                out[key] = "[REDACTED]"
            else:
                out[key] = redact_value(val, patterns)
        return out
    # numbers, booleans — pass through
    return value


def redact_data(data: Any, patterns: list[Pattern[str]]) -> Any:
    """Redact an entry's ``data`` field. Returns a new value (no mutation).
    The ``error`` field needs no redaction: it is a fixed
    ``{name, message, stack, code}`` mapping with no free-form keys.
    """
    if data is None:
        return None
    return redact_value(data, patterns)
