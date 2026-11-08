<?php

declare(strict_types=1);

namespace Nocturna\Logger\Tests;

use Nocturna\Logger\LevelResolver;
use Nocturna\Logger\Levels;
use Nocturna\Logger\Redactor;
use PHPUnit\Framework\TestCase;

final class LevelsRedactTest extends TestCase
{
    protected function setUp(): void
    {
        putenv('LOG_LEVEL');
        putenv('NODE_ENV');
        putenv('DEV');
    }

    // ---- level resolution ----

    public function testEnvDetectionMatrix(): void
    {
        self::assertSame('ERROR', LevelResolver::resolveLevel()); // production default

        putenv('NODE_ENV=development');
        self::assertSame('DEBUG', LevelResolver::resolveLevel());
        putenv('NODE_ENV');
        putenv('DEV=true');
        self::assertSame('DEBUG', LevelResolver::resolveLevel());
        putenv('DEV');

        putenv('NODE_ENV=test');
        self::assertSame('SILENT', LevelResolver::resolveLevel());
        putenv('LOG_LEVEL=warn');
        self::assertSame('WARN', LevelResolver::resolveLevel());
        putenv('NODE_ENV');
        putenv('LOG_LEVEL=garbage');
        self::assertSame('ERROR', LevelResolver::resolveLevel());
        putenv('LOG_LEVEL');

        self::assertSame('INFO', LevelResolver::resolveLevel('INFO')); // explicit wins
    }

    public function testShouldLogSemantics(): void
    {
        // SILENT is a disable switch, not a point on the severity scale.
        self::assertFalse(LevelResolver::shouldLog('INFO', 'SILENT'));
        self::assertFalse(LevelResolver::shouldLog('SILENT', 'DEBUG'));
        self::assertFalse(LevelResolver::shouldLog('DEBUG', 'ERROR'));
        self::assertTrue(LevelResolver::shouldLog('ERROR', 'ERROR'));
        self::assertTrue(LevelResolver::shouldLog('CRITICAL', 'ERROR'));
        self::assertTrue(LevelResolver::shouldLog('DEBUG', 'DEBUG'));
    }

    public function testLevelParseIsCaseInsensitiveAndRejectsGarbage(): void
    {
        self::assertSame('WARN', Levels::parse('warn'));
        self::assertNull(Levels::parse('garbage'));
    }

    // ---- redaction ----

    /** @return array<int, string> */
    private function patterns(): array
    {
        return Redactor::buildPatterns();
    }

    public function testDefaultsIncludePassword(): void
    {
        $this->assertNotEmpty($this->patterns());
        $this->assertTrue(Redactor::keyIsSensitive('password', $this->patterns()));
    }

    public function testAppendsCustomPatternsCaseInsensitively(): void
    {
        $patterns = Redactor::buildPatterns(['internal_id']);
        $this->assertTrue(Redactor::keyIsSensitive('INTERNAL_ID', $patterns));
    }

    public function testCanOmitDefaults(): void
    {
        $patterns = Redactor::buildPatterns(['custom'], includeDefaults: false);
        $this->assertTrue(Redactor::keyIsSensitive('custom', $patterns));
        $this->assertFalse(Redactor::keyIsSensitive('password', $patterns));
    }

    public function testRedactsKnownSensitiveKeys(): void
    {
        $out = Redactor::redactValue(
            ['password' => 'hunter2', 'user' => 'alice'],
            $this->patterns()
        );
        self::assertSame(['password' => '[REDACTED]', 'user' => 'alice'], $out);
    }

    public function testRedactsKeysCaseInsensitively(): void
    {
        $out = Redactor::redactValue(
            ['API_KEY' => 'abc', 'ApiKey' => 'def', 'apikey' => 'ghi'],
            $this->patterns()
        );
        self::assertSame(
            ['API_KEY' => '[REDACTED]', 'ApiKey' => '[REDACTED]', 'apikey' => '[REDACTED]'],
            $out
        );
    }

    public function testRedactsNestedObjectsRecursively(): void
    {
        $value = [
            'request' => [
                'headers' => [
                    'authorization' => 'Bearer xyz',
                    'content-type' => 'application/json',
                ],
            ],
        ];
        $out = Redactor::redactValue($value, $this->patterns());
        self::assertSame(
            [
                'request' => [
                    'headers' => [
                        'authorization' => '[REDACTED]',
                        'content-type' => 'application/json',
                    ],
                ],
            ],
            $out
        );
    }

    public function testRedactsInsideArrays(): void
    {
        $out = Redactor::redactValue(
            ['users' => [['token' => 'a'], ['token' => 'b']]],
            $this->patterns()
        );
        self::assertSame(
            ['users' => [['token' => '[REDACTED]'], ['token' => '[REDACTED]']]],
            $out
        );
    }

    public function testPreservesNonSensitiveData(): void
    {
        $value = ['orderId' => 42, 'status' => 'ok', 'nested' => ['a' => 1]];
        self::assertSame($value, Redactor::redactValue($value, $this->patterns()));
    }

    public function testPassesPrimitivesThrough(): void
    {
        self::assertSame('plain string', Redactor::redactValue('plain string', $this->patterns()));
        self::assertSame(42, Redactor::redactValue(42, $this->patterns()));
        self::assertNull(Redactor::redactData(null, $this->patterns()));
    }
}
