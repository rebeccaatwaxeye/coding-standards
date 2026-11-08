<?php

declare(strict_types=1);

namespace Nocturna\Logger;

use Nocturna\Logger\Sinks\ConsoleSink;

/**
 * Logger instance — the object returned by LoggerFactory::create().
 * Callable as shorthand for info(): `$log('hello')` == `$log->info('hello')`.
 */
final class Logger
{
    /** @var array<int, bool> sink index => disabled */
    private array $disabled = [];

    /** @param array<int, Sink> $sinks */
    public function __construct(
        private readonly string $module,
        private readonly ?string $level,
        private readonly array $sinks,
        private readonly array $patterns,
    ) {
    }

    public function module(): string
    {
        return $this->module;
    }

    /** Shorthand for info(). */
    public function __invoke(mixed $message = null, mixed $meta = null): void
    {
        $this->dispatch('INFO', $message, $meta);
    }

    public function log(mixed $message = null, mixed $meta = null): void
    {
        $this->dispatch('INFO', $message, $meta);
    }

    public function debug(mixed $message = null, mixed $meta = null): void
    {
        $this->dispatch('DEBUG', $message, $meta);
    }

    public function info(mixed $message = null, mixed $meta = null): void
    {
        $this->dispatch('INFO', $message, $meta);
    }

    public function warn(mixed $message = null, mixed $meta = null): void
    {
        $this->dispatch('WARN', $message, $meta);
    }

    public function error(mixed $message = null, mixed $meta = null): void
    {
        $this->dispatch('ERROR', $message, $meta);
    }

    public function critical(mixed $message = null, mixed $meta = null): void
    {
        $this->dispatch('CRITICAL', $message, $meta);
    }

    /** Dispose all sinks. Call on shutdown. */
    public function dispose(): void
    {
        foreach ($this->sinks as $sink) {
            try {
                $sink->dispose();
            } catch (\Throwable) {
                // logger must never throw
            }
        }
    }

    private function dispatch(string $level, mixed $message, mixed $meta): void
    {
        if (! LevelResolver::shouldLog($level, LevelResolver::resolveLevel($this->level))) {
            return;
        }

        $meta = $meta ?? [];
        $entry = Entry::make(
            timestamp: date('d-m-Y H:i:s'),
            level: $level,
            module: $this->module,
            message: Entry::formatMessage($message),
            location: $this->captureLocation(),
            traceId: $meta['traceId'] ?? $meta['trace_id'] ?? null,
            operation: $meta['operation'] ?? $meta['op'] ?? null,
            data: $meta['data'] ?? null,
            error: Entry::normaliseError($meta['error'] ?? null),
        );

        // Redact first, always.
        if (array_key_exists('data', $entry)) {
            $entry['data'] = Redactor::redactData($entry['data'], $this->patterns);
        }

        foreach ($this->sinks as $index => $sink) {
            if (isset($this->disabled[$index])) {
                continue;
            }
            try {
                $sink->write($entry);
            } catch (\Throwable $e) {
                $this->disabled[$index] = true;
                fwrite(STDERR, "[logger/{$this->module}] sink failed: ".$e->getMessage()."\n");
            }
        }
    }

    /** Caller `file:line` (basename only), mirroring the TS output shape. */
    private function captureLocation(): ?string
    {
        $trace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 6);
        foreach ($trace as $frame) {
            $file = (string) ($frame['file'] ?? '');
            if (str_contains($file, '/src/Logger.php') || str_ends_with($file, 'Logger.php')) {
                continue;
            }
            $basename = str_replace('\\', '/', $file);
            $basename = substr($basename, (int) strrpos($basename, '/') + 1);

            return $basename.':'.(string) ($frame['line'] ?? 0);
        }

        return null;
    }
}
