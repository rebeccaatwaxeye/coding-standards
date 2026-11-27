<?php

declare(strict_types=1);

// Composer-free autoloader for running the suite via phpunit.phar.
// CI uses `composer install` + vendor/autoload instead.
spl_autoload_register(function (string $class): void {
    $prefix = 'Nocturna\\Logger\\';
    if (! str_starts_with($class, $prefix)) {
        return;
    }
    $relative = str_replace('\\', '/', substr($class, strlen($prefix)));
    $file = __DIR__.'/../src/'.$relative.'.php';
    if (is_file($file)) {
        require $file;
    }
});
