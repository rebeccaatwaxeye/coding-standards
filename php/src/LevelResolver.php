<?php

declare(strict_types=1);

namespace Nocturna\Logger;

/** Level resolution and filtering (§14.1–14.2). */
final class LevelResolver
{
    private function __construct()
    {
    }

    /** Priority: explicit > LOG_LEVEL env (invalid ignored) > environment detection. */
    public static function resolveLevel(?string $explicit = null): string
    {
        if ($explicit !== null) {
            return $explicit;
        }

        $envLevel = self::envLevel();
        if ($envLevel !== null) {
            return $envLevel;
        }

        if (self::isTest()) {
            return 'SILENT';
        }
        if (self::isDev()) {
            return 'DEBUG';
        }

        return 'ERROR';
    }

    /** SILENT is a disable switch, not a point on the severity scale. */
    public static function shouldLog(string $entry, string $minimum): bool
    {
        if ($minimum === 'SILENT' || $entry === 'SILENT') {
            return false;
        }

        return Levels::value($entry) >= Levels::value($minimum);
    }

    public static function isDev(): bool
    {
        return self::envVar('NODE_ENV') === 'development'
            || self::envVar('DEV') === 'true';
    }

    public static function isTest(): bool
    {
        return self::envVar('NODE_ENV') === 'test';
    }

    private static function envLevel(): ?string
    {
        $raw = self::envVar('LOG_LEVEL');

        return $raw === null ? null : Levels::parse($raw);
    }

    private static function envVar(string $key): ?string
    {
        $value = getenv($key);

        return $value === false || $value === '' ? null : $value;
    }
}
