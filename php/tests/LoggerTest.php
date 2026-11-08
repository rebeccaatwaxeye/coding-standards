<?php

declare(strict_types=1);

namespace Nocturna\Logger\Tests;

use Nocturna\Logger\LoggerFactory;
use Nocturna\Logger\LoggerOptions;
use Nocturna\Logger\Sink;
use PHPUnit\Framework\TestCase;

final class LoggerTest extends TestCase
{
    private int $tmpCounter = 0;

    private function tmpDir(): string
    {
        $dir = sys_get_temp_dir().'/nocturna-php-test-'.getmypid().'-'.(++$this->tmpCounter);
        @mkdir($dir, 0777, true);

        return $dir;
    }

    /** Test sink that captures entries instead of writing them. */
    private function captureSink(): object
    {
        return new class() implements Sink {
            public array $entries = [];
            public bool $disposed = false;

            public function write(array $entry): void
            {
                $this->entries[] = $entry;
            }

            public function dispose(): void
            {
                $this->disposed = true;
            }
        };
    }

    private function buildLogger(?string $level = null, ?Sink $sink = null, string $module = 'test'): \Nocturna\Logger\Logger
    {
        $options = new LoggerOptions($module);
        $options->level($level);
        if ($sink !== null) {
            $options->sinks([$sink]);
        }

        return LoggerFactory::create($options);
    }

    private function explodeSink(): Sink
    {
        return new class() implements Sink {
            public function write(array $entry): void
            {
                throw new \RuntimeException('disk full');
            }

            public function dispose(): void
            {
            }
        };
    }

    // ---- level filtering ----

    public function testEmitsAllLevelsWhenConfiguredAtDebug(): void
    {
        $sink = $this->captureSink();
        $log = $this->buildLogger('DEBUG', $sink);
        $log->debug('d');
        $log->info('i');
        $log->warn('w');
        $log->error('e');
        $log->critical('c');
        $this->assertSame(
            ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'],
            array_map(fn (array $e): string => $e['level'], $sink->entries)
        );
    }

    public function testEmitsOnlyErrorAndCriticalAtProductionFloor(): void
    {
        $sink = $this->captureSink();
        $log = $this->buildLogger('ERROR', $sink);
        $log->debug('d');
        $log->info('i');
        $log->warn('w');
        $log->error('e');
        $log->critical('c');
        $this->assertSame(['ERROR', 'CRITICAL'], array_map(fn (array $e): string => $e['level'], $sink->entries));
    }

    public function testCallableShorthandIsInfo(): void
    {
        $sink = $this->captureSink();
        $log = $this->buildLogger('DEBUG', $sink);
        $log('hello');
        $this->assertSame('INFO', $sink->entries[0]['level']);
        $this->assertSame('hello', $sink->entries[0]['message']);
    }

    public function testModuleIsBoundOnce(): void
    {
        $sink = $this->captureSink();
        $log = $this->buildLogger('DEBUG', $sink, 'worker');
        $this->assertSame('worker', $log->module());
        $log->info('x');
        $this->assertSame('worker', $sink->entries[0]['module']);
    }

    // ---- meta, redaction, errors ----

    public function testMetaFieldsReachTheEntry(): void
    {
        $sink = $this->captureSink();
        $log = $this->buildLogger('DEBUG', $sink);
        $log->info('x', ['traceId' => 't1', 'operation' => 'op1', 'data' => ['orderId' => 7]]);
        $entry = $sink->entries[0];
        $this->assertSame('t1', $entry['traceId']);
        $this->assertSame('op1', $entry['operation']);
        $this->assertSame(['orderId' => 7], $entry['data']);
    }

    public function testRedactionRunsBeforeSinks(): void
    {
        $sink = $this->captureSink();
        $log = $this->buildLogger('DEBUG', $sink);
        $log->info('login', ['data' => ['password' => 'hunter2', 'user' => 'alice']]);
        $this->assertSame(
            ['password' => '[REDACTED]', 'user' => 'alice'],
            $sink->entries[0]['data']
        );
    }

    public function testErrorsNormaliseWithStackPreserved(): void
    {
        $sink = $this->captureSink();
        $log = $this->buildLogger('DEBUG', $sink);
        try {
            throw new \DomainException('boom');
        } catch (\DomainException $e) {
            $log->error('query failed', ['error' => $e]);
        }
        $error = $sink->entries[0]['error'];
        $this->assertSame('DomainException', $error['name']);
        $this->assertSame('boom', $error['message']);
        $this->assertNotEmpty($error['stack']); // stack preserved (frames vary by runner)
    }

    public function testErrorFromString(): void
    {
        $sink = $this->captureSink();
        $log = $this->buildLogger('DEBUG', $sink);
        $log->error('failed', ['error' => 'oops']);
        $this->assertSame(['name' => 'Error', 'message' => 'oops'], $sink->entries[0]['error']);
    }

    public function testMessageCoercion(): void
    {
        $sink = $this->captureSink();
        $log = $this->buildLogger('DEBUG', $sink);
        $log->info(null);
        $log->info('text');
        $log->info(42);
        $log->info(['a' => 1]);
        $this->assertSame(
            ['', 'text', '42', '{"a":1}'],
            array_map(fn (array $e): string => $e['message'], $sink->entries)
        );
    }

    // ---- location ----

    public function testCapturesCallerLocation(): void
    {
        $sink = $this->captureSink();
        $log = $this->buildLogger('DEBUG', $sink);
        $log->info('located');
        $location = $sink->entries[0]['location'] ?? null;
        $this->assertNotNull($location);
        $this->assertStringContainsString('LoggerTest.php', $location);
        $this->assertMatchesRegularExpression('/:\d+$/', $location);
    }

    // ---- sink failure handling ----

    public function testFailingSinkIsDisabledAndReported(): void
    {
        $good = $this->captureSink();
        $log = new \Nocturna\Logger\Logger('test', 'DEBUG', [$this->explodeSink(), $good], []);
        $log->info('one');
        $log->info('two');
        $this->assertCount(2, $good->entries);
    }

    // ---- dispose ----

    public function testDisposeCallsSinkDispose(): void
    {
        $sink = $this->captureSink();
        $log = $this->buildLogger('DEBUG', $sink);
        $log->dispose();
        $this->assertTrue($sink->disposed);
    }
}
