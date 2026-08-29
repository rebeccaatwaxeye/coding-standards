# PHP (Laravel)

> Applies to: Laravel, PHP 8.2+, general PHP services.
> Load alongside the core `AGENTS.md`.

## Toolchain

| Concern | Choice |
|---|---|
| Formatter | Laravel Pint |
| Linter | PHPStan (level 8+) |

## Structure

- **One class per file.** PSR-4 autoloading strictly enforced.
- **Controllers: thin.** Delegate to single-responsibility Action or Service classes. Target < 100 lines.
- **Models:** business logic extracted to Actions/Observers. Models define relationships, casts, scopes, and accessors only.
- **Validation:** Form Request classes for every non-trivial endpoint. No inline validation in controllers.
- **APIs:** OpenAPI specs first. Generate frontend types from spec.

## Types

- Declare strict types: `declare(strict_types=1);` at the top of every file.
- Type all parameters, returns, and properties. No untyped signatures.
- Prefer enums over string constants for fixed sets.
- Constructor property promotion for simple DTOs.

## Error Handling

```php
try {
    $this->chargeCard($order);
} catch (PaymentException $e) {
    // Preserve the previous exception when rethrowing
    throw new OrderFailedException('payment failed', previous: $e);
}
```

- Catch specific exception types, never bare `\Exception`.
- Never `catch (Exception $e) {}` — log or rethrow.
- Never `catch (Throwable $e) { return null; }` — the caller cannot distinguish empty from broken.
- Do not use exceptions for expected control flow (validation, not-found). Return a typed result.

## Logging

Use Laravel's `Log` facade with structured context — never `error_log()`, `print_r()`, or `var_dump()`.

```php
Log::error('payment failed', [
    'order_id'  => $order->id,
    'exception' => $e,
]);
```

- Context array, never string interpolation: `Log::info("order $id")` is wrong.
- Never log passwords, tokens, or credentials.
- See core `AGENTS.md` §9 for level semantics and the swallowed-error table.

## Testing

- Pest or PHPUnit. Feature tests for endpoints, unit tests for Actions.
- Do not hit real third-party services — use HTTP fakes.
- Refresh database per test; no shared state between tests.
