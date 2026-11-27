<?php

declare(strict_types=1);

namespace Nocturna\Logger;

/**
 * Configuration for the logger factory.
 *
 * @param array<int, Sink>|null $sinks              default: [ConsoleSink]
 * @param array<int, string>    $redactAdditional   case-insensitive key substrings
 * @param bool                  $redactIncludeDefaults set false to disable built-ins (NOT RECOMMENDED)
 */
final class LoggerOptions
{
    public ?string $level = null;
    /** @var array<int, Sink>|null */
    public ?array $sinks = null;
    /** @var array<int, string> */
    public array $redactAdditional = [];
    public bool $redactIncludeDefaults = true;

    public function __construct(public readonly string $module)
    {
    }

    public function level(?string $level): self
    {
        $this->level = $level;

        return $this;
    }

    /** @param array<int, Sink> $sinks */
    public function sinks(array $sinks): self
    {
        $this->sinks = $sinks;

        return $this;
    }

    /** @param array<int, string> $patterns */
    public function redactAdditional(array $patterns): self
    {
        $this->redactAdditional = $patterns;

        return $this;
    }

    public function redactIncludeDefaults(bool $include): self
    {
        $this->redactIncludeDefaults = $include;

        return $this;
    }
}
