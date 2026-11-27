"""`nocturna-logger` — zero-config structured logger for Python.

Python reference implementation of the Nocturna logging spec (§14).
Produces byte-identical output to ``@nocturna/logger``: same levels,
thresholds, redaction, formats, rotation and retention.

Example::

    from nocturna_logger import console_sink, create_logger, file_sink

    log = create_logger("worker", sinks=[console_sink(), file_sink()])
    log.info("job started", operation="processOrder")
    log.error("payment failed", error=payment_err, data={"orderId": 42})
"""

from .global_handlers import install_global_handlers
from .levels import resolve_level, should_log
from .logger import Logger, LoggerOptions, create_logger
from .redact import build_patterns, redact_data
from .sinks import ConsoleSink, FileSinkOptions, JsonSinkOptions, console_sink, file_sink, json_sink
from .types import LEVEL_VALUE, LogEntry, LogError, LogLevel, LogMeta, Sink

__all__ = [
    "LEVEL_VALUE",
    "ConsoleSink",
    "FileSinkOptions",
    "JsonSinkOptions",
    "LogEntry",
    "LogError",
    "LogMeta",
    "LogLevel",
    "Logger",
    "LoggerOptions",
    "Sink",
    "build_patterns",
    "console_sink",
    "create_logger",
    "file_sink",
    "install_global_handlers",
    "json_sink",
    "redact_data",
    "resolve_level",
    "should_log",
]
