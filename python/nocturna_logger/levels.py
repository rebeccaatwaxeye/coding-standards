"""Level resolution and filtering (§14.1–14.2).

Priority:
 1. Explicit ``level`` parameter (from ``LoggerOptions``)
 2. ``LOG_LEVEL`` env var (case-insensitive, invalid values ignored)
 3. Environment detection: dev → DEBUG, prod → ERROR, test → SILENT
"""

import os
from typing import Optional

from .types import LEVEL_VALUE, parse_level


def resolve_level(explicit: Optional[str] = None) -> str:
    """Resolve the effective log level from explicit param → env → detection."""
    if explicit is not None:
        return explicit

    env_level_value = env_level()
    if env_level_value is not None:
        return env_level_value

    if is_test():
        return "SILENT"
    if is_dev():
        return "DEBUG"
    return "ERROR"


def should_log(entry: str, minimum: str) -> bool:
    """SILENT is a disable switch, not a point on the severity scale —
    it suppresses everything regardless of numeric ordering. (Its value of 0
    would otherwise let every entry through a >= comparison, which is the
    opposite of the intent.)
    """
    if minimum == "SILENT" or entry == "SILENT":
        return False
    return LEVEL_VALUE[entry] >= LEVEL_VALUE[minimum]


def env_var(key: str) -> Optional[str]:
    value = os.environ.get(key)
    return value if value else None


def env_level() -> Optional[str]:
    raw = env_var("LOG_LEVEL")
    if raw is None:
        return None
    return parse_level(raw)


def is_dev() -> bool:
    return env_var("NODE_ENV") == "development" or env_var("DEV") == "true"


def is_test() -> bool:
    return env_var("NODE_ENV") == "test"
