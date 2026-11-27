<?php

declare(strict_types=1);

namespace Nocturna\Logger\Sinks;

use Nocturna\Logger\Formatter;
use Nocturna\Logger\Sink;

/** Console sink — ANSI output. ERROR/CRITICAL → stderr, rest → stdout. */
final class ConsoleSink implements Sink
{
    public function write(array $entry): void
    {
        $line = Formatter::formatAnsi($entry);
        $stream = $entry['level'] === 'ERROR' || $entry['level'] === 'CRITICAL'
            ? STDERR
            : STDOUT;
        fwrite($stream, $line);
    }

    public function dispose(): void
    {
    }
}
