# Python

> Applies to: all Python services, scripts, and packages.
> Load alongside the core `AGENTS.md`.

## Toolchain

| Concern | Choice |
|---|---|
| Formatter & Linter | `ruff` (replaces Black, isort, flake8, pydocstyle) |
| Type checker | `mypy` (strict) or `pyright` |
| Validation | `pydantic` v2 at all system boundaries |
| Lockfile | `uv.lock` (uv) or `poetry.lock` (Poetry) |

```toml
# pyproject.toml — enforce the rules below
[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM", "TRY", "T20", "PTH"]
# T20 bans print(); PTH enforces pathlib; B904 enforces raise ... from

[tool.mypy]
strict = true
```

## Structure

- One class per file where possible. Max 400 lines per file.
- Group related modules in packages with explicit `__init__.py` exports.

## Types

- **Type hints mandatory** on all function signatures and class attributes.
- Use `from __future__ import annotations` to avoid string quoting.
- No bare `Any` without justification. Prefer specific types or `TypeVar`.
- `Optional[T]` / `T | None` — do not use untyped `None` returns where a sentinel would be clearer.

## Validation

- `pydantic` v2 at every boundary: API inputs, config parsing, env vars.
- Validate once at the edge. Do not re-validate deep in the call stack.

## Paths & Files

- **Use `pathlib.Path`, never `os.path`.**
- Context managers for all resources: `with open(...)`, never bare `open()`.

## Docstrings

- Google style. Every public module, class, and method.

```python
def charge_card(order: Order, token: str) -> ChargeResult:
    """Charge the customer's card for an order.

    Args:
        order: The order to charge.
        token: Payment token from the provider.

    Raises:
        PaymentError: If the provider rejects the charge.
    """
```

## Error Handling

```python
# Preserve the cause when re-raising
try:
    charge_card(order, token)
except PaymentError as exc:
    raise OrderFailed("payment failed") from exc
```

- **Always `raise ... from exc`** — never bare `raise` inside `except`, it loses the cause.
- Never `except Exception: pass`.
- Never `except Exception: return None` — the caller cannot distinguish empty from broken.
- Catch specific exceptions, not bare `Exception`.
- No exceptions for expected control flow.

## Logging

Use `structlog`. **Never `print()` for diagnostics.**

```python
import structlog
log = structlog.get_logger()

log.error("payment_failed", order_id=order.id, exc_info=exc)
log.info("server_listening", port=8000)
```

- Structured key/values, not f-strings: `log.info(f"order {id}")` is wrong.
- `exc_info=exc` to attach a traceback — never `str(exc)`.
- Never log secrets, tokens, or credentials.
- Configure once at startup with `structlog.configure()`: `JSONRenderer` in production, `ConsoleRenderer` in development.
- Add a redaction processor to the processor chain so secret keys are stripped before rendering — structlog ships no redactor.
- Honour the level contract: `ERROR` production floor via `LOG_LEVEL` (core §9.2).
- See core `AGENTS.md` §9 for level semantics and the swallowed-error table.

## Testing

- `pytest`. Test files as `test_*.py`.
- Fixtures over setup/teardown methods.
- `pytest.raises` for error cases; assert on the exception type and message.
- Do not hit real third-party services — use HTTP fakes.
- Coverage gate in CI: `pytest --cov --cov-branch --cov-fail-under=90`.
