<?php

declare(strict_types=1);

namespace Nocturna\Logger;

/** Sink interface — every output backend implements this. */
interface Sink
{
    /** A sink must never throw; the logger disables failing sinks. */
    public function write(array $entry): void;

    /** Called when the logger is disposed. Release held resources here. */
    public function dispose(): void;
}
