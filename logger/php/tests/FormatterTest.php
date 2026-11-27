<?php

declare(strict_types=1);

namespace Nocturna\Logger\Tests;

use Nocturna\Logger\Entry;
use Nocturna\Logger\Formatter;
use PHPUnit\Framework\TestCase;

/** Expected strings mirror node/src/format.test.ts — the parity contract. */
final class FormatterTest extends TestCase
{
    private function makeEntry(string $level = 'INFO', array $overrides = []): array
    {
        $entry = Entry::make(
            timestamp: '01-02-2026 14:05:32',
            level: $level,
            module: 'api',
            message: 'server listening',
        );

        return array_merge($entry, $overrides);
    }

    // ---- plain text ----

    public function testPlainTextFormatsTimestampPaddedLevelTagMessage(): void
    {
        $entry = $this->makeEntry('INFO', ['location' => 'server.php:42']);
        $this->assertSame(
            "[01-02-2026 14:05:32] [INFO    ] [api/server.php:42] server listening\n",
            Formatter::formatPlainText($entry)
        );
    }

    public function testPlainTextPadsCriticalToEightChars(): void
    {
        $this->assertStringContainsString('[CRITICAL]', Formatter::formatPlainText($this->makeEntry('CRITICAL')));
    }

    public function testPlainTextOmitsLocationWhenAbsent(): void
    {
        $this->assertSame(
            "[01-02-2026 14:05:32] [INFO    ] [api] server listening\n",
            Formatter::formatPlainText($this->makeEntry())
        );
    }

    public function testPlainTextAppendsMetaSuffix(): void
    {
        $entry = $this->makeEntry('INFO', [
            'traceId' => 'abc',
            'operation' => 'boot',
            'error' => Entry::error('Error', 'boom'),
        ]);
        $line = Formatter::formatPlainText($entry);
        $this->assertStringEndsWith('{traceId=abc, op=boot, error=boom}', rtrim($line));
    }

    // ---- json ----

    public function testJsonEmitsCoreFieldsInFixedOrder(): void
    {
        $line = Formatter::formatJson($this->makeEntry());
        $this->assertTrue(str_ends_with($line, "\n"));
        $decoded = json_decode($line, true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame('01-02-2026 14:05:32', $decoded['ts']);
        $this->assertSame('INFO', $decoded['level']);
        $this->assertSame('api', $decoded['module']);
        $this->assertSame('server listening', $decoded['msg']);
        $this->assertSame(['ts', 'level', 'module', 'msg'], array_keys($decoded));
    }

    public function testJsonOmitsOptionalFieldsWhenAbsent(): void
    {
        $decoded = json_decode(Formatter::formatJson($this->makeEntry()), true);
        $this->assertArrayNotHasKey('loc', $decoded);
        $this->assertArrayNotHasKey('traceId', $decoded);
        $this->assertArrayNotHasKey('op', $decoded);
        $this->assertArrayNotHasKey('data', $decoded);
        $this->assertArrayNotHasKey('error', $decoded);
    }

    public function testJsonIncludesOptionalFieldsWhenPresent(): void
    {
        $entry = $this->makeEntry('ERROR', [
            'location' => 'a.php:1',
            'traceId' => 't1',
            'operation' => 'op1',
            'data' => ['x' => 1],
            'error' => Entry::error('Error', 'boom'),
        ]);
        $decoded = json_decode(Formatter::formatJson($entry), true);
        $this->assertSame('a.php:1', $decoded['loc']);
        $this->assertSame('t1', $decoded['traceId']);
        $this->assertSame('op1', $decoded['op']);
        $this->assertSame(['x' => 1], $decoded['data']);
        $this->assertSame(['name' => 'Error', 'message' => 'boom'], $decoded['error']);
    }

    // ---- ansi ----

    public function testAnsiWrapsTimestampInDimCodes(): void
    {
        $line = Formatter::formatAnsi($this->makeEntry());
        $this->assertStringContainsString("\e[2m[01-02-2026 14:05:32]\e[0m", $line);
    }

    public function testAnsiMapsEachLevelToColourAndIcon(): void
    {
        $cases = [
            ['DEBUG', "\e[36m", "\u{1F41B}"],
            ['INFO', "\e[32m", "\u{2139}\u{FE0F}"],
            ['WARN', "\e[33m", "\u{26A0}\u{FE0F}"],
            ['ERROR', "\e[31m", "\u{274C}"],
            ['CRITICAL', "\e[35m", "\u{1F525}"],
        ];
        foreach ($cases as [$level, $ansi, $icon]) {
            $line = Formatter::formatAnsi($this->makeEntry($level));
            $this->assertStringContainsString($ansi, $line, "missing $ansi for $level");
            $this->assertStringContainsString($icon, $line, "missing $icon for $level");
        }
    }

    public function testAnsiBoldsTheModuleTag(): void
    {
        $entry = $this->makeEntry('INFO', ['location' => 'a.php:9']);
        $this->assertStringContainsString("\e[1mapi/a.php:9\e[0m", Formatter::formatAnsi($entry));
    }

    // ---- entry helpers ----

    public function testNormaliseErrorShapesPayloads(): void
    {
        // dataclass-ish array keeps only canonical keys
        $entry = Entry::make('ts', 'INFO', 'api', 'm', error: [
            'name' => 'E', 'message' => 'm', 'password' => 'p',
        ]);
        $this->assertSame('m', $entry['error']['message']);
        $this->assertArrayNotHasKey('password', $entry['error']);

        // real exception -> stack preserved
        try {
            throw new \DomainException('k');
        } catch (\DomainException $e) {
            $entry = Entry::make('ts', 'INFO', 'api', 'm', error: $e);
        }
        $this->assertSame('DomainException', $entry['error']['name']);
        $this->assertStringContainsString('k', $entry['error']['stack']);

        // strings and other values wrap
        $this->assertSame(['name' => 'Error', 'message' => 'oops'], Entry::normaliseError('oops'));
        $this->assertSame(['name' => 'Error', 'message' => '42'], Entry::normaliseError(42));
        $this->assertNull(Entry::normaliseError(null));
    }

    public function testFormatMessageCoercion(): void
    {
        $this->assertSame('', Entry::formatMessage(null));
        $this->assertSame('text', Entry::formatMessage('text'));
        $this->assertSame('42', Entry::formatMessage(42));
        $this->assertSame('{"a":1}', Entry::formatMessage(['a' => 1]));
        try {
            throw new \RuntimeException('bad');
        } catch (\RuntimeException $e) {
            $this->assertSame('bad', Entry::formatMessage($e));
        }
    }
}
