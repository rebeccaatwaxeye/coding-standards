<?php

declare(strict_types=1);

namespace Nocturna\Logger\Sinks;

use Nocturna\Logger\Formatter;
use Nocturna\Logger\Sink;

/**
 * Structured JSON sink — one JSON object per line (JSONL).
 *
 * Use in containerised services where the platform collects logs
 * (Uptrace, Loki, Bugsink, CloudWatch, etc.).
 */
final class JsonSink implements Sink
{
    private const DEFAULT_FILE_PATH = './logs/structured.jsonl';

    /** @param array{output?: string, file_path?: string} $options */
    public function __construct(private array $options = [])
    {
        $this->options += [
            'output' => 'stdout',
            'file_path' => self::DEFAULT_FILE_PATH,
        ];
    }

    public function write(array $entry): void
    {
        $line = Formatter::formatJson($entry);
        if ($this->options['output'] === 'stdout') {
            fwrite(STDOUT, $line);

            return;
        }

        try {
            $dir = dirname($this->options['file_path']);
            if ($dir !== '' && $dir !== '.' && ! is_dir($dir)) {
                mkdir($dir, 0777, true);
            }
            file_put_contents($this->options['file_path'], $line, FILE_APPEND | LOCK_EX);
        } catch (\Throwable $e) {
            fwrite(STDERR, '[logger/json] write failed: '.$e->getMessage()."\n");
        }
    }

    public function dispose(): void
    {
    }
}
