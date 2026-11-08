"""The logger factory and instance (§14.3).

- Module name bound once at creation — not repeated per call.
- Calls are silenced when the entry level < configured minimum.
- Redaction runs before every sink, always on.
- The logger never raises; a failing sink is reported to stderr and disabled.
"""

import contextlib
import json
import sys
import time
from dataclasses import dataclass
from types import FrameType
from typing import Any, Callable, Optional

from .levels import resolve_level, should_log
from .redact import build_patterns, redact_data
from .sinks import ConsoleSink
from .types import LogMeta, make_entry

# Injectable clock — tests monkeypatch ``nocturna_logger.logger._now``.
_now: Callable[[], float] = time.time


def _timestamp_now() -> str:
    return time.strftime("%d-%m-%Y %H:%M:%S", time.localtime(_now()))


def _stderr_line(message: str) -> None:
    sys.stderr.write(message + "\n")


def _normalise_error(error: Any) -> Any:
    """None passthrough; any other error input is normalised by ``make_entry``."""
    return error


def _caller_location(user_frame: Optional[FrameType]) -> Optional[str]:
    if user_frame is None:
        return None
    path = user_frame.f_code.co_filename
    basename = path.replace("\\", "/").rsplit("/", 1)[-1]
    return f"{basename}:{user_frame.f_lineno}"


def _skip_frame(filename: str) -> bool:
    normalized = filename.replace("\\", "/")
    return "/nocturna_logger/" in normalized


@dataclass
class LoggerOptions:
    """Configuration for ``create_logger``."""

    module: str
    """Module name — bound once, not repeated per call."""

    level: Optional[str] = None
    """Minimum level to emit. Default: ``DEBUG`` in development, ``ERROR`` in
    production, ``SILENT`` in tests, overridden by the ``LOG_LEVEL`` env var."""

    sinks: Optional[list[Any]] = None
    """Sinks to write to. Default: ``[console_sink()]``."""

    redact_additional: Optional[list[Any]] = None
    """Additional key patterns (regex or case-insensitive substrings) to redact."""

    redact_include_defaults: bool = True
    """Set to False to disable the built-in patterns — NOT RECOMMENDED."""


class Logger:
    """Logger instance — the object returned by ``create_logger``.
    Callable as shorthand for ``info()``: ``log('hello')`` == ``log.info('hello')``.
    """

    def __init__(self, options: LoggerOptions) -> None:
        self._module = options.module
        self._explicit_level = options.level
        self._patterns = build_patterns(
            options.redact_additional, options.redact_include_defaults
        )
        self._sinks: list[Any] = (
            options.sinks if options.sinks is not None else [ConsoleSink()]
        )
        self._disabled: set = set()

    @property
    def module(self) -> str:
        return self._module

    def log(self, message: Any = None, meta: Optional[LogMeta] = None) -> None:
        """Shorthand for ``info()``."""
        self._dispatch("INFO", message, meta)

    def debug(self, message: Any = None, meta: Optional[LogMeta] = None) -> None:
        self._dispatch("DEBUG", message, meta)

    def info(self, message: Any = None, meta: Optional[LogMeta] = None) -> None:
        self._dispatch("INFO", message, meta)

    def warn(self, message: Any = None, meta: Optional[LogMeta] = None) -> None:
        self._dispatch("WARN", message, meta)

    def error(self, message: Any = None, meta: Optional[LogMeta] = None) -> None:
        self._dispatch("ERROR", message, meta)

    def critical(self, message: Any = None, meta: Optional[LogMeta] = None) -> None:
        self._dispatch("CRITICAL", message, meta)

    __call__ = log

    def dispose(self) -> None:
        """Dispose all sinks. Call on shutdown."""
        for sink in self._sinks:
            with contextlib.suppress(Exception):  # logger must never throw
                sink.dispose()

    # ---- internals ----

    def _dispatch(self, level: str, message: Any, meta: Optional[LogMeta]) -> None:
        if not should_log(level, resolve_level(self._explicit_level)):
            return

        location = self._capture_location()
        entry = self._build_entry(level, message, meta, location)

        # Redact first, always.
        entry["data"] = redact_data(entry.get("data"), self._patterns)

        for index, sink in enumerate(self._sinks):
            if index in self._disabled:
                continue
            try:
                sink.write(entry)
            except Exception as exc:
                self._disabled.add(index)
                _stderr_line(
                    f"[logger/{self._module}] sink failed: {exc.__class__.__name__}: {exc}"
                )

    def _capture_location(self) -> Optional[str]:
        frame: Optional[FrameType] = sys._getframe()  # noqa: SLF001 — stdlib access
        while frame is not None:
            filename = frame.f_code.co_filename.replace("\\", "/")
            if not _skip_frame(filename):
                return _caller_location(frame)
            frame = frame.f_back
        return None

    def _build_entry(
        self,
        level: str,
        message: Any,
        meta: Optional[LogMeta],
        location: Optional[str],
    ) -> dict[str, Any]:
        if meta is None:
            meta = LogMeta()
        normalised_error = _normalise_error(meta.error)
        return make_entry(
            timestamp=_timestamp_now(),
            level=level,
            module=self._module,
            message=_format_message(message),
            location=location,
            trace_id=meta.trace_id,
            operation=meta.operation,
            data=meta.data,
            error=normalised_error,
        )


def _format_message(message: Any) -> str:
    if message is None:
        return ""
    if message is True:
        return "true"
    if message is False:
        return "false"
    if isinstance(message, str):
        return message
    if isinstance(message, (int, float)):
        return str(message)
    if isinstance(message, BaseException):
        return str(message)
    try:
        return json.dumps(message, separators=(",", ":"))
    except (TypeError, ValueError):
        return str(message)


def create_logger(options: LoggerOptions) -> Logger:
    """Create a structured logger.

    - Module name bound once at creation — not repeated per call.
    - Calls are silenced when the entry level < configured minimum.
    - Redaction runs before every sink, always on.
    - The logger never raises; a failing sink is reported to stderr and disabled.
    """
    return Logger(options)
