"""Canonical log types — the dict passed to every sink.
Never format entries yourself; sinks handle formatting.
"""

from dataclasses import dataclass
from typing import Any, Optional, Protocol

LEVEL_VALUE: dict[str, int] = {
    "SILENT": 0,
    "DEBUG": 10,
    "INFO": 20,
    "WARN": 30,
    "ERROR": 40,
    "CRITICAL": 50,
}

_LEVEL_NAMES = {name for name in LEVEL_VALUE}


class Sink(Protocol):
    """Sink interface — every output backend implements this.

    The logger calls ``sink.write(entry)`` for every entry that passes the
    level filter. A sink must never raise; failures are reported to stderr
    and the sink is disabled.
    """

    def write(self, entry: dict[str, Any]) -> None: ...

    def dispose(self) -> None:  # optional in practice; default provided
        ...


LogEntry = dict[str, Any]
"""Canonical log entry — a dict with the fixed key order produced by
``make_entry``. Sinks own formatting; never format entries yourself."""

LogLevel = str
"""Level name: ``SILENT | DEBUG | INFO | WARN | ERROR | CRITICAL``
(see ``LEVEL_VALUE`` for the numeric scale)."""


@dataclass
class LogError:
    """Error as structured data — stack is preserved, never lost."""

    name: str = "Error"
    message: str = ""
    stack: Optional[str] = None
    code: Optional[str] = None


@dataclass
class LogMeta:
    """Metadata accepted by logger methods.

    ``level``, ``module``, ``timestamp``, and ``location`` are injected
    automatically; callers provide only what varies per call.
    """

    trace_id: Optional[str] = None
    operation: Optional[str] = None
    data: Any = None
    error: Any = None


def make_entry(
    timestamp: str,
    level: str,
    module: str,
    message: str,
    location: Optional[str] = None,
    trace_id: Optional[str] = None,
    operation: Optional[str] = None,
    data: Any = None,
    error: Optional[LogError] = None,
) -> dict[str, Any]:
    """Build the canonical LogEntry dict (keys in fixed order)."""
    entry: dict[str, Any] = {
        "timestamp": timestamp,
        "level": level,
        "module": module,
        "message": message,
    }
    if location is not None:
        entry["location"] = location
    if trace_id is not None:
        entry["traceId"] = trace_id
    if operation is not None:
        entry["operation"] = operation
    if data is not None:
        entry["data"] = data
    if error is not None:
        entry["error"] = _error_as_dict(error)
    return entry


def _error_as_dict(error: Any) -> dict[str, Any]:
    """Normalise any error input into the canonical plain-dict shape."""
    if isinstance(error, dict):
        out: dict[str, Any] = {
            "name": str(error.get("name", "Error")),
            "message": str(error.get("message", error)),
        }
        if isinstance(error.get("stack"), str):
            out["stack"] = error["stack"]
        if isinstance(error.get("code"), str):
            out["code"] = error["code"]
        return out
    if isinstance(error, LogError):
        out = {"name": error.name, "message": error.message}
        if error.stack:
            out["stack"] = error.stack
        if error.code:
            out["code"] = error.code
        return out
    if isinstance(error, BaseException):
        import traceback

        return {
            "name": type(error).__name__,
            "message": str(error),
            "stack": "".join(
                traceback.format_exception(type(error), error, error.__traceback__)
            ).rstrip("\n"),
        }
    return {"name": "Error", "message": str(error)}


def parse_level(raw: str) -> Optional[str]:
    """Case-insensitive parse, mirroring LOG_LEVEL handling."""
    upper = raw.upper()
    return upper if upper in _LEVEL_NAMES else None
