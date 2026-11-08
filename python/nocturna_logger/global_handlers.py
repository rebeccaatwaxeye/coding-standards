"""§14.8 — Global error handlers: fail loud at the edge.

Installs ``sys.excepthook`` and ``threading.excepthook`` handlers that log at
CRITICAL and exit non-zero. A process that cannot honour its invariants
should die loudly and be restarted by the supervisor — not limp along in an
unknown state.
"""

import sys
import threading
import time
from typing import Any

from .types import LogError, LogMeta

_INSTALL_LOCK = threading.Lock()
_INSTALLED = False


def _log_critical_and_exit(logger: Any, error: LogError, error_type: str) -> None:
    logger.critical_with(
        "Uncaught exception — process cannot continue",
        LogMeta(error=error, data={"type": error_type}),
    )
    # Give sinks time to flush to file before exiting (mirrors TS: 200ms)
    time.sleep(0.2)
    import os

    os._exit(1)


def install_global_handlers(logger: Any) -> None:
    """Install the global exception handlers. Call once at process start."""
    global _INSTALLED
    with _INSTALL_LOCK:
        if _INSTALLED:
            return
        _INSTALLED = True

    def _excepthook(exc_type, exc_value, exc_traceback) -> None:
        import traceback

        stack = "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))
        error = LogError(
            name=exc_type.__name__,
            message=str(exc_value),
            stack=stack,
        )
        _log_critical_and_exit(logger, error, "uncaughtException")

    def _thread_excepthook(args: threading.ExceptHookArgs) -> None:
        if args.exc_type is SystemExit:
            return
        import traceback

        stack = "".join(
            traceback.format_exception(args.exc_type, args.exc_value, args.exc_traceback)
        )
        error = LogError(
            name=args.exc_type.__name__,
            message=str(args.exc_value),
            stack=stack,
        )
        _log_critical_and_exit(logger, error, "unhandledThreadException")

    sys.excepthook = _excepthook
    threading.excepthook = _thread_excepthook
