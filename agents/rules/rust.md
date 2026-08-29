# Rust

> Applies to: all Rust crates, binaries, and services.
> Load alongside the core `AGENTS.md`.

## Toolchain

| Concern | Choice |
|---|---|
| Formatter | `cargo fmt` (rustfmt) |
| Linter | `cargo clippy -- -D warnings` |
| Docs | `cargo doc` in CI, fail on warnings |
| Audit | `cargo audit` before adding crates |

## Error Handling

- `thiserror` for library errors, `anyhow` for application glue.
- **No `unwrap()` or `expect()` in production paths** without a `// SAFETY:` comment justifying the invariant.
- No `.unwrap_or_default()` to hide a real error.
- Never `let _ = result;` to discard a `Result`.

```rust
// Propagate with context, preserving the source chain
let config = fs::read_to_string(path)
    .context("failed to read config")?;
```

- Libraries return typed errors. Applications may use `anyhow` at the top.
- Do not use panics for recoverable errors.

## Unsafe

- **Prohibited without an ADR.**
- Every `unsafe` block requires a `// SAFETY:` comment explaining why it is sound.

## Structure

- One concept per module.
- Keep `lib.rs` / `main.rs` as a thin router/registry.
- All `pub` items need `///` doc comments, with examples where non-obvious.

## Dependencies

- Prefer the standard library.
- Audit new crates with `cargo audit`.
- Pin versions in `Cargo.lock` (committed for binaries).

## Style

- Prefer iterator chains over explicit loops where readability is maintained.
- Prefer `tokio` for async runtimes.
- Explicitly document `Send`/`Sync` requirements for multi-threaded contexts.
- Use `#[must_use]` on functions whose result must not be discarded.

## Logging

Use the `tracing` crate. **Never `println!` or `eprintln!` for diagnostics.**

```rust
error!(order_id = %order.id, error = %e, "payment failed");
info!(port = 8000, "server listening");
```

- Structured fields, not format strings: `error!("failed: {}", e)` is wrong.
- `tracing::instrument` on functions worth tracing.
- Never log secrets or tokens.
- See core `AGENTS.md` §9 for level semantics and the swallowed-error table.
