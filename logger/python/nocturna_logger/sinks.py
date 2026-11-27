"""Sinks — console (ANSI), file (daily rotation + retention), JSON (JSONL)."""

import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional

from .format import format_ansi, format_json, format_plain_text
from .types import Sink

# Injectable clock — tests monkeypatch ``nocturna_logger.sinks._now``.
_now: Callable[[], float] = time.time


def _stderr_line(message: str) -> None:
    sys.stderr.write(message + "\n")


def console_sink() -> "ConsoleSink":
    """Create the console sink. This is the default sink when none is provided."""
    return ConsoleSink()


class ConsoleSink(Sink):
    """Console sink — ANSI-coloured output (terminal).

    ERROR and CRITICAL go to stderr; everything else to stdout.
    This is the default sink when none is provided.
    Output is byte-identical to ``@nocturna/logger``'s console sink.
    """

    def write(self, entry: dict[str, Any]) -> None:
        line = format_ansi(entry)
        stream = sys.stderr if entry["level"] in ("ERROR", "CRITICAL") else sys.stdout
        stream.write(line)
        stream.flush()

    def dispose(self) -> None:
        pass


@dataclass
class FileSinkOptions:
    """Options for the file sink."""

    dir: str = "./logs"
    """Directory to write log files into. Default: ``./logs``."""

    retain_days: int = 14
    """How many days of log files to retain. Default: 14. Set to 0 to disable
    pruning (not recommended)."""

    max_total_size_mb: float = 100.0
    """Max total size of the log directory in MB. Default: 100. Oldest files
    are pruned first when exceeded."""


class FileSink(Sink):
    """File sink — writes daily-rotated plain-text logs (§14.7).

    File name pattern: ``app-YYYY-MM-DD.log``. Prunes files older than
    ``retain_days`` on first write of each day; prunes oldest-first when the
    directory exceeds ``max_total_size_mb``. Behaviour is identical to
    ``@nocturna/logger``'s file sink.
    """

    def __init__(self, options: Optional[FileSinkOptions] = None) -> None:
        self.options = options or FileSinkOptions()
        self._dir = Path(self.options.dir)
        self._current_path: Optional[Path] = None
        self._current_date: Optional[str] = None
        self._pruned_today = False

    def write(self, entry: dict[str, Any]) -> None:
        now = _now()
        today = time.strftime("%Y-%m-%d", time.localtime(now))

        if self._current_date != today:
            self._current_date = today
            self._current_path = self._dir / f"app-{today}.log"
            self._pruned_today = False

        try:
            self._dir.mkdir(parents=True, exist_ok=True)
            with self._current_path.open("a", encoding="utf-8") as file:
                file.write(format_plain_text(entry))

            if not self._pruned_today:
                self._pruned_today = True
                self._prune_old_files()
        except OSError as exc:
            # Logger must never crash the app — fail to stderr and continue.
            _stderr_line(f"[logger/file] write failed: {exc}")

    def _prune_old_files(self) -> None:
        retain_days = self.options.retain_days
        max_total_size_mb = self.options.max_total_size_mb
        if retain_days <= 0 and max_total_size_mb <= 0:
            return

        try:
            files = sorted(
                str(path.name)
                for path in self._dir.iterdir()
                if path.name.startswith("app-") and path.name.endswith(".log")
            )
        except OSError:
            return  # directory read failed — skip pruning

        now_ms = _now() * 1000.0
        retain_ms = retain_days * 24 * 60 * 60 * 1000.0
        max_bytes = max_total_size_mb * 1024 * 1024
        total_size = 0.0

        for name in files:
            path = self._dir / name
            try:
                stat_result = path.stat()
            except OSError:
                continue  # skip unreadable files
            total_size += stat_result.st_size

            age_ms = now_ms - stat_result.st_mtime * 1000.0
            if age_ms > retain_ms:
                try:
                    path.unlink()
                    total_size -= stat_result.st_size
                except OSError:
                    pass

        # If over total size cap, prune oldest first
        if total_size > max_bytes:
            for name in files:
                if total_size <= max_bytes:
                    break
                path = self._dir / name
                try:
                    stat_result = path.stat()
                    path.unlink()
                    total_size -= stat_result.st_size
                except OSError:
                    pass

    def dispose(self) -> None:
        pass


def file_sink(options: Optional[FileSinkOptions] = None) -> FileSink:
    """Create a file sink writing daily-rotated plain-text logs.
    Default directory: ``./logs``, retention: 14 days, size cap: 100 MB.
    """
    return FileSink(options)


@dataclass
class JsonSinkOptions:
    """Options for the structured JSON sink."""

    output: str = "stdout"
    """Output destination. Default: ``stdout``."""

    file_path: str = "./logs/structured.jsonl"
    """File path when ``output='file'``."""


class JsonSink(Sink):
    """Structured JSON sink — one JSON object per line (JSONL).

    Use in containerised services where the platform collects logs
    (Uptrace, Loki, Bugsink, CloudWatch, etc.).
    """

    def __init__(self, options: Optional[JsonSinkOptions] = None) -> None:
        self.options = options or JsonSinkOptions()
        self._file_path = Path(self.options.file_path)

    def write(self, entry: dict[str, Any]) -> None:
        line = format_json(entry)
        if self.options.output == "stdout":
            sys.stdout.write(line)
            sys.stdout.flush()
            return

        try:
            parent = self._file_path.parent
            if str(parent):
                parent.mkdir(parents=True, exist_ok=True)
            with self._file_path.open("a", encoding="utf-8") as file:
                file.write(line)
        except OSError as exc:
            _stderr_line(f"[logger/json] write failed: {exc}")

    def dispose(self) -> None:
        pass


def json_sink(options: Optional[JsonSinkOptions] = None) -> JsonSink:
    """Structured JSON sink — one JSON object per line.
    Default output: stdout. ``output='file'`` appends to
    ``./logs/structured.jsonl`` unless a path is given.
    """
    return JsonSink(options)
