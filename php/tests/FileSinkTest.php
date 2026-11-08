<?php

declare(strict_types=1);

namespace Nocturna\Logger\Tests;

use Nocturna\Logger\FileSinkOptions;
use Nocturna\Logger\Sinks\FileSink;
use PHPUnit\Framework\TestCase;

/** Rotation, retention, and size-cap pruning — clock injected via `clock`. */
final class FileSinkTest extends TestCase
{
    private array $dirs = [];

    /** 2026-11-07 12:00:00 UTC-agnostic unix time is derived; deltas matter. */
    private int $now;

    private string $today;

    protected function setUp(): void
    {
        $this->now = time() - 5 * 365 * 24 * 60 * 60; // frozen clock in the past (TS-suite trick)
        $this->today = gmdate('Y-m-d', $this->now);
    }

    protected function tearDown(): void
    {
        foreach ($this->dirs as $dir) {
            if (is_dir($dir)) {
                foreach (scandir($dir) ?: [] as $file) {
                    @unlink($dir.'/'.$file);
                }
                @rmdir($dir);
            }
        }
    }

    private function tmpDir(): string
    {
        $dir = sys_get_temp_dir().'/nocturna-php-file-'.getmypid().'-'.random_int(1, PHP_INT_MAX);
        @mkdir($dir, 0777, true);
        $this->dirs[] = $dir;

        return $dir;
    }

    private function makeSink(array $options = [], ?callable $clock = null): FileSink
    {
        $dir = $this->tmpDir();

        return new FileSink(array_merge([
            'dir' => $dir,
            'clock' => $clock ?? fn (): int => $this->now,
        ], $options));
    }

    private function makeEntry(): array
    {
        return [
            'timestamp' => '07-11-2026 12:00:00',
            'level' => 'INFO',
            'module' => 'api',
            'message' => 'hello',
        ];
    }

    private function read(string $dir, string $name): string
    {
        return (string) file_get_contents($dir.'/'.$name);
    }

    private function backdate(string $dir, string $name, int $mtime, int $size = 10): void
    {
        file_put_contents($dir.'/'.$name, str_repeat('x', $size));
        touch($dir.'/'.$name, $mtime);
    }

    public function testCreatesDatedPlainTextFile(): void
    {
        $dir = $this->tmpDir();
        $this->dirs[] = $dir;
        $sink = $this->makeSink(['dir' => $dir]);
        $sink->write($this->makeEntry());

        $this->assertSame(
            "[07-11-2026 12:00:00] [INFO    ] [api] hello\n",
            $this->read($dir, 'app-'.$this->today.'.log')
        );
    }

    public function testAppendsSameDayEntriesToOneFile(): void
    {
        $sink = $this->makeSink();
        $sink->write($this->makeEntry());
        $sink->write($this->makeEntry());
        $this->assertCount(2, explode("\n", trim($this->read($this->dirs[0], 'app-'.$this->today.'.log'))));
    }

    public function testRollsOverOnTheNextDay(): void
    {
        $shift = 0;
        $sink = $this->makeSink([], function () use (&$shift): int {
            return $this->now + $shift;
        });
        $sink->write($this->makeEntry());
        $shift = 24 * 60 * 60;
        $sink->write($this->makeEntry());
        $next = gmdate('Y-m-d', $this->now + $shift);

        $dir = $this->dirs[0];
        $this->assertFileExists($dir.'/app-'.$this->today.'.log');
        $this->assertFileExists($dir.'/app-'.$next.'.log');
    }

    public function testPrunesFilesOlderThanRetainDays(): void
    {
        $dir = $this->tmpDir();
        $this->dirs[] = $dir;
        $this->backdate($dir, 'app-2020-01-01.log', $this->now - 20 * 24 * 60 * 60);
        $this->backdate($dir, 'app-2026-10-30.log', $this->now - 8 * 24 * 60 * 60);

        $sink = $this->makeSink(['dir' => $dir]);
        $sink->write($this->makeEntry());

        $this->assertFileDoesNotExist($dir.'/app-2020-01-01.log');
        $this->assertFileExists($dir.'/app-2026-10-30.log');
    }

    public function testRemovesOldestFirstWhenSizeCapExceeded(): void
    {
        $dir = $this->tmpDir();
        $this->dirs[] = $dir;
        file_put_contents($dir.'/app-'.$this->today.'.log', '');
        $this->backdate($dir, 'app-2020-01-01.log', $this->now, 2048);
        $this->backdate($dir, 'app-2021-01-01.log', $this->now, 2048);

        $sink = $this->makeSink([
            'dir' => $dir,
            'retain_days' => 0,
            'max_total_size_mb' => 0.003,
        ]);
        $sink->write($this->makeEntry());

        $this->assertFileDoesNotExist($dir.'/app-2020-01-01.log');
        $this->assertFileExists($dir.'/app-2021-01-01.log');
        $this->assertFileExists($dir.'/app-'.$this->today.'.log');
    }

    public function testKeepsOldFilesWhenPruningDisabled(): void
    {
        $dir = $this->tmpDir();
        $this->dirs[] = $dir;
        $this->backdate($dir, 'app-2020-01-01.log', $this->now - 30 * 24 * 60 * 60);

        $sink = $this->makeSink([
            'dir' => $dir,
            'retain_days' => 0,
            'max_total_size_mb' => 0.0,
        ]);
        $sink->write($this->makeEntry());

        $this->assertFileExists($dir.'/app-2020-01-01.log');
        $this->assertFileExists($dir.'/app-'.$this->today.'.log');
    }

    public function testHonoursExplicitRetentionOverrides(): void
    {
        $dir = $this->tmpDir();
        $this->dirs[] = $dir;
        $this->backdate($dir, 'app-2026-11-06.log', $this->now - 2 * 24 * 60 * 60);

        $sink = $this->makeSink(['dir' => $dir, 'retain_days' => 1]);
        $sink->write($this->makeEntry());

        $this->assertFileDoesNotExist($dir.'/app-2026-11-06.log');
    }
}
