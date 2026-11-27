<?php

declare(strict_types=1);

namespace Nocturna\Logger;

/** Canonical log entry helpers — entries are plain arrays with a fixed key order. */
final class Entry
{
    private function __construct()
    {
    }

    /** Error as structured data — stack is preserved, never lost. */
    public static function error(
        string $name,
        string $message,
        ?string $stack = null,
        ?string $code = null
    ): array {
        $out = ['name' => $name, 'message' => $message];
        if ($stack !== null) {
            $out['stack'] = $stack;
        }
        if ($code !== null) {
            $out['code'] = $code;
        }

        return $out;
    }

    /** Normalise any error input into the canonical plain-array shape. */
    public static function normaliseError(mixed $error): ?array
    {
        if ($error === null) {
            return null;
        }
        if (is_array($error)) {
            $out = [
                'name' => (string) ($error['name'] ?? 'Error'),
                'message' => (string) ($error['message'] ?? json_encode($error)),
            ];
            if (isset($error['stack']) && is_string($error['stack'])) {
                $out['stack'] = $error['stack'];
            }
            if (isset($error['code']) && is_string($error['code'])) {
                $out['code'] = $error['code'];
            }

            return $out;
        }
        if ($error instanceof \Throwable) {
            return self::error($error::class, $error->getMessage(), $error->getTraceAsString());
        }
        if (is_string($error)) {
            return self::error('Error', $error);
        }

        return self::error('Error', (string) $error);
    }

    /** Build the canonical LogEntry array (keys in fixed order). */
    public static function make(
        string $timestamp,
        string $level,
        string $module,
        string $message,
        ?string $location = null,
        ?string $traceId = null,
        ?string $operation = null,
        mixed $data = null,
        mixed $error = null
    ): array {
        $entry = [
            'timestamp' => $timestamp,
            'level' => $level,
            'module' => $module,
            'message' => $message,
        ];
        if ($location !== null) {
            $entry['location'] = $location;
        }
        if ($traceId !== null) {
            $entry['traceId'] = $traceId;
        }
        if ($operation !== null) {
            $entry['operation'] = $operation;
        }
        if ($data !== null) {
            $entry['data'] = $data;
        }
        if ($error !== null) {
            $entry['error'] = self::normaliseError($error);
        }

        return $entry;
    }

    /** Coerce any loggable value into a string message. */
    public static function formatMessage(mixed $message): string
    {
        if ($message === null) {
            return '';
        }
        if (is_string($message)) {
            return $message;
        }
        if (is_bool($message)) {
            return $message ? 'true' : 'false';
        }
        if (is_int($message) || is_float($message)) {
            return (string) $message;
        }
        if ($message instanceof \Throwable) {
            return $message->getMessage();
        }
        $json = json_encode($message, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return $json === false ? (string) $message : $json;
    }
}
