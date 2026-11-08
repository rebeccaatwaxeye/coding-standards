<?php

declare(strict_types=1);

namespace Nocturna\Logger\Sinks;

use Nocturna\Logger\Formatter;
use Nocturna\Logger\Sink;

/**
 * File sink — writes daily-rotated plain-text logs (§14.7).
 *
 * File name pattern: `app-YYYY-MM-DD.log`. Prunes files older than
 * `retainDays` (default 14) on first write of each day; prunes oldest-first
 * when the directory exceeds `maxTotalSizeMB`. Identical to the TS file sink.
 */
final class FileSink implements Sink
{
    private ?string $currentPath = null;
    private ?string $currentDate = null;
    private bool $prunedToday = false;

    /** @param array{dir?: string, retain_days?: int, max_total_size_mb?: float, clock?: ?callable} $options */
    public function __construct(private array $options = [])
    {
        $this->options += [
            'dir' => './logs',
            'retain_days' => 14,
            'max_total_size_mb' => 100.0,
            'clock' => null, // injectable for tests: fn(): int unix timestamp
        ];
    }

    public function write(array $entry): void
    {
        $now = ($this->options['clock'])();
        $today = date('Y-m-d', (int) $now);

        if ($this->currentDate !== $today) {
            $this->currentDate = $today;
            $this->currentPath = $this->options['dir'].'/app-'.$today.'.log';
            $this->prunedToday = false;
        }

        try {
            if (! is_dir($this->options['dir'])) {
                mkdir($this->options['dir'], 0777, true);
            }
            file_put_contents($this->currentPath, Formatter::formatPlainText($entry), FILE_APPEND | LOCK_EX);

            if (! $this->prunedToday) {
                $this->prunedToday = true;
                $this->pruneOldFiles((int) $now);
            }
        } catch (\Throwable $e) {
            // Logger must never crash the app — fail to stderr and continue.
            fwrite(STDERR, '[logger/file] write failed: '.$e->getMessage()."\n");
        }
    }

    public function dispose(): void
    {
    }

    private function pruneOldFiles(int $now): void
    {
        $retainDays = (int) $this->options['retain_days'];
        $maxTotalSizeMb = (float) $this->options['max_total_size_mb'];
        if ($retainDays <= 0 && $maxTotalSizeMb <= 0.0) {
            return;
        }

        $dir = $this->options['dir'];
        $names = @scandir($dir);
        if ($names === false) {
            return; // directory read failed — skip pruning
        }
        $files = array_values(array_filter(
            $names,
            fn (string $name): bool => str_starts_with($name, 'app-') && str_ends_with($name, '.log')
        ));
        sort($files); // alphabetical = chronological

        $nowMs = $now * 1000.0;
        $retainMs = $retainDays * 24 * 60 * 60 * 1000.0;
        $maxBytes = $maxTotalSizeMb * 1024 * 1024;
        $totalSize = 0.0;

        foreach ($files as $file) {
            $path = $dir.'/'.$file;
            $stat = @stat($path);
            if ($stat === false) {
                continue; // skip unreadable files
            }
            $totalSize += $stat['size'];
            $ageMs = $nowMs - $stat['mtime'] * 1000.0;
            if ($ageMs > $retainMs) {
                if (@unlink($path)) {
                    $totalSize -= $stat['size'];
                }
            }
        }

        // If over total size cap, prune oldest first
        if ($totalSize > $maxBytes) {
            foreach ($files as $file) {
                if ($totalSize <= $maxBytes) {
                    break;
                }
                $path = $dir.'/'.$file;
                $stat = @stat($path);
                if ($stat === false) {
                    continue;
                }
                if (@unlink($path)) {
                    $totalSize -= $stat['size'];
                }
            }
        }
    }
}
