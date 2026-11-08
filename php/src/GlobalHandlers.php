<?php

declare(strict_types=1);

namespace Nocturna\Logger;

/**
 * §14.8 — Global error handlers: fail loud at the edge.
 *
 * Instills exception/error/shutdown handlers that log at CRITICAL and exit
 * non-zero. A process that cannot honour its invariants should die loudly
 * and be restarted by the supervisor — not limp along in an unknown state.
 */
final class GlobalHandlers
{
    private static bool $installed = false;

    private function __construct()
    {
    }

    public static function install(Logger $logger): void
    {
        if (self::$installed) {
            return;
        }
        self::$installed = true;

        set_exception_handler(function (\Throwable $e) use ($logger): void {
            $logger->critical('Uncaught exception — process cannot continue', [
                'error' => Entry::error($e::class, $e->getMessage(), $e->getTraceAsString()),
                'data' => ['type' => 'uncaughtException'],
            ]);
            self::exitAfterFlush();
        });

        set_error_handler(function (int $severity, string $message, string $file, int $line) use ($logger): bool {
            if ((error_reporting() & $severity) === 0) {
                return false; // respect the operator's error_reporting settings
            }
            $logger->critical('PHP error — process cannot continue', [
                'error' => Entry::error(
                    'PHPError',
                    $message,
                    code: (string) $severity,
                    stack: "at {$file}:{$line}"
                ),
                'data' => ['type' => 'phpError'],
            ]);
            self::exitAfterFlush();

            return true;
        });

        register_shutdown_function(function () use ($logger): void {
            $fatal = error_get_last();
            if ($fatal !== null && in_array($fatal['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
                $logger->critical('Fatal error — process cannot continue', [
                    'error' => Entry::error(
                        'FatalError',
                        $fatal['message'],
                        code: (string) $fatal['type'],
                        stack: "at {$fatal['file']}:{$fatal['line']}"
                    ),
                    'data' => ['type' => 'fatalError'],
                ]);
            }
        });
    }

    private static function exitAfterFlush(): void
    {
        // Give sinks time to flush to file before exiting (mirrors TS: 200ms)
        usleep(200000);
        exit(1);
    }

    /** @internal — used by tests to reset the install guard. */
    public static function resetForTests(): void
    {
        self::$installed = false;
    }
}
