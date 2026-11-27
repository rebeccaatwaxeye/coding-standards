<?php

declare(strict_types=1);

namespace Nocturna\Logger;

/**
 * Mandatory redaction — runs before every sink, always on, cannot be disabled.
 *
 * Default patterns (case-insensitive, applied recursively to any array or
 * meta.data) mirror `@nocturna/logger` exactly:
 *   token, password, passwd, pwd, secret, credential, authorization, bearer,
 *   api[_-]?key, apikey, access[_-]?key, private[_-]?key, cookie, session, jwt, otp
 *
 * Redacted values become `[REDACTED]` — never truncated-but-partial.
 * Redaction is by KEY: plain string values are never redacted directly.
 */
final class Redactor
{
    private function __construct()
    {
    }

    /** @return array<int, string> */
    public static function defaultPatternSources(): array
    {
        return [
            'token', 'password', 'passwd', 'pwd', 'secret', 'credential',
            'authorization', 'bearer', 'api[_-]?key', 'apikey', 'access[_-]?key',
            'private[_-]?key', 'cookie', 'session', 'jwt', 'otp',
        ];
    }

    /** @param array<int, string> $additional case-insensitive substrings */
    public static function buildPatterns(array $additional = [], bool $includeDefaults = true): array
    {
        $patterns = [];
        if ($includeDefaults) {
            foreach (self::defaultPatternSources() as $source) {
                $patterns[] = '/'.$source.'/i';
            }
        }
        foreach ($additional as $extra) {
            $patterns[] = '/'.str_replace('/', '\/', $extra).'/i';
        }

        return $patterns;
    }

    public static function keyIsSensitive(string $key, array $patterns): bool
    {
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $key) === 1) {
                return true;
            }
        }

        return false;
    }

    /** Deep-redact a value by key, recursively. Strings are never redacted directly. */
    public static function redactValue(mixed $value, array $patterns): mixed
    {
        if ($value === null || is_string($value)) {
            return $value;
        }
        if (is_array($value) && array_is_list($value)) {
            $out = [];
            foreach ($value as $item) {
                $out[] = self::redactValue($item, $patterns);
            }

            return $out;
        }
        if (is_array($value)) {
            $out = [];
            foreach ($value as $key => $val) {
                $out[$key] = self::keyIsSensitive((string) $key, $patterns)
                    ? '[REDACTED]'
                    : self::redactValue($val, $patterns);
            }

            return $out;
        }
        if (is_bool($value) || is_int($value) || is_float($value)) {
            return $value;
        }

        return $value; // objects and other values pass through untouched
    }

    /** Redact an entry's `data` field. The `error` field is shape-fixed (no free-form keys). */
    public static function redactData(mixed $data, array $patterns): mixed
    {
        if ($data === null) {
            return null;
        }

        return self::redactValue($data, $patterns);
    }
}
