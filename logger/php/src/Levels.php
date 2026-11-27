<?php

declare(strict_types=1);

namespace Nocturna\Logger;

/**
 * Numeric severity — higher value = more severe.
 * Spaced by 10 so new levels can be inserted without renumbering.
 */
final class Levels
{
    public const SILENT = 0;
    public const DEBUG = 10;
    public const INFO = 20;
    public const WARN = 30;
    public const ERROR = 40;
    public const CRITICAL = 50;

    public const NAMES = ['SILENT', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];

    /** Case-insensitive parse, mirroring LOG_LEVEL handling. Returns null if invalid. */
    public static function parse(string $raw): ?string
    {
        $upper = strtoupper($raw);

        return in_array($upper, self::NAMES, true) ? $upper : null;
    }

    public static function value(string $name): int
    {
        return constant(self::class.'::'.$name);
    }
}
