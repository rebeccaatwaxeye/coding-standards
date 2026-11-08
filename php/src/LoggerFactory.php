<?php

declare(strict_types=1);

namespace Nocturna\Logger;

use Nocturna\Logger\Sinks\ConsoleSink;

/** Create a structured logger (§14.3). */
final class LoggerFactory
{
    private function __construct()
    {
    }

    public static function create(LoggerOptions $options): Logger
    {
        $patterns = Redactor::buildPatterns(
            $options->redactAdditional,
            $options->redactIncludeDefaults,
        );
        $sinks = $options->sinks ?? [new ConsoleSink()];

        return new Logger($options->module, $options->level, $sinks, $patterns);
    }
}
