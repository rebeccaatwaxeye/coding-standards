<?php

declare(strict_types=1);

namespace Nocturna\Logger;

/**
 * Formatters shared by the sinks (§14.5). Byte-for-byte identical to
 * `@nocturna/logger`'s formats — parity fixtures in every language's tests
 * assert this.
 */
final class Formatter
{
    private const LEVEL_PAD = 8; // widest is "CRITICAL" = 8 chars

    private const ICONS = [
        'DEBUG' => "\u{1F41B}",           // 🐛
        'INFO' => "\u{2139}\u{FE0F}",     // ℹ️
        'WARN' => "\u{26A0}\u{FE0F}",     // ⚠️
        'ERROR' => "\u{274C}",            // ❌
        'CRITICAL' => "\u{1F525}",        // 🔥
    ];

    private const ANSI = [
        'DEBUG' => "\u{1B}[36m",          // cyan
        'INFO' => "\u{1B}[32m",           // green
        'WARN' => "\u{1B}[33m",           // yellow
        'ERROR' => "\u{1B}[31m",          // red
        'CRITICAL' => "\u{1B}[35m",       // magenta
    ];

    private const RESET = "\u{1B}[0m";
    private const DIM = "\u{1B}[2m";
    private const BOLD = "\u{1B}[1m";

    private function __construct()
    {
    }

    public static function formatPlainText(array $entry): string
    {
        $level = str_pad($entry['level'], self::LEVEL_PAD, ' ');
        $location = isset($entry['location']) ? '/'.$entry['location'] : '';
        $meta = self::buildMetaSuffix($entry);

        return "[{$entry['timestamp']}] [{$level}] [{$entry['module']}{$location}] {$entry['message']}{$meta}\n";
    }

    /** Key order is fixed: ts, level, module, msg, loc, traceId, op, data, error. */
    public static function formatJson(array $entry): string
    {
        $obj = [
            'ts' => $entry['timestamp'],
            'level' => $entry['level'],
            'module' => $entry['module'],
            'msg' => $entry['message'],
        ];
        if (isset($entry['location'])) {
            $obj['loc'] = $entry['location'];
        }
        if (isset($entry['traceId'])) {
            $obj['traceId'] = $entry['traceId'];
        }
        if (isset($entry['operation'])) {
            $obj['op'] = $entry['operation'];
        }
        if (array_key_exists('data', $entry) && $entry['data'] !== null) {
            $obj['data'] = $entry['data'];
        }
        if (isset($entry['error'])) {
            $error = $entry['error'];
            $errorObj = ['name' => $error['name'], 'message' => $error['message']];
            if (isset($error['stack'])) {
                $errorObj['stack'] = $error['stack'];
            }
            if (isset($error['code'])) {
                $errorObj['code'] = $error['code'];
            }
            $obj['error'] = $errorObj;
        }

        return json_encode($obj, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n";
    }

    public static function formatAnsi(array $entry): string
    {
        $icon = self::ICONS[$entry['level']] ?? '';
        $ansiLevel = self::ANSI[$entry['level']] ?? '';
        $location = isset($entry['location']) ? '/'.$entry['location'] : '';
        $meta = self::buildMetaSuffix($entry);
        $level = str_pad($entry['level'], self::LEVEL_PAD, ' ');

        return self::DIM."[{$entry['timestamp']}]".self::RESET
            .' '.$ansiLevel.self::BOLD."{$icon} {$level}".self::RESET
            .' '.self::BOLD."{$entry['module']}{$location}".self::RESET
            ." {$entry['message']}{$meta}\n";
    }

    /** ` {traceId=x, op=y, error=z}` suffix — the fixed order mirrors TS. */
    private static function buildMetaSuffix(array $entry): string
    {
        $parts = [];
        if (isset($entry['traceId'])) {
            $parts[] = "traceId={$entry['traceId']}";
        }
        if (isset($entry['operation'])) {
            $parts[] = "op={$entry['operation']}";
        }
        if (isset($entry['error'])) {
            $parts[] = "error={$entry['error']['message']}";
        }

        return $parts === [] ? '' : ' {'.implode(', ', $parts).'}';
    }
}
