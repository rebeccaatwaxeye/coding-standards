# Coding Standards

> **Version:** 1.11.0
> **Last reviewed:** 2026-11-27
> **Applies to:** All repositories (Laravel, Astro/Svelte, Rust, Python, Infrastructure)
> **Enforced by:** CI lint gates and pre-commit hooks. Do not rely on manual review for formatting or style.
> **Distribution:** Installed into repositories as a stamped, read-only snapshot — via the
> `@nocturna/standards` npm package, the `nocturna-standards` cargo CLI, or
> `standards/agents/install.sh`
> (see README, "Installing the Standards"). The source of truth is the `coding-standards`
> repository — never edit installed copies; change the source and re-install.
> **Versioning:** This header is the single source of truth for the standards version. The
> installer stamp, `@nocturna/standards`, and `nocturna-standards` all derive their version from it.

---

## 1. Philosophy

- **Explicit over implicit.** If a new engineer cannot trace execution in 30 seconds, it is too clever.
- **Fail fast, fail loudly.** Validate at every system boundary.
- **Tooling > willpower.** Formatters and linters decide syntax; humans decide architecture.
- **One purpose per function. One concept per file.**

---

## 2. Universal Heuristics

| Concern | Rule | Rationale |
|---------|------|-----------|
| **Function length** | ≤ 30 lines ideal; 50 lines hard ceiling | Cognitive load and testability |
| **Function purpose** | Name must not contain "and" or "or" | Single responsibility |
| **File length** | 200–400 lines comfort zone. Beyond ~500, look for a natural split — but never split a file just to satisfy the number | Navigation and review speed |
| **Nesting depth** | ≤ 3 levels (if/for/match) | Flatten via early returns or extraction |
| **Parameters** | ≤ 4 positional args; use structs/objects beyond that | Self-documenting signatures |
| **Cyclomatic complexity** | ≤ 10 per function | Branch coverage feasibility |

> **Line length is deliberately absent from this table.** It is a formatter
> concern, not a review concern: each language section pins one `printWidth`
> value, the formatter enforces it, and nobody bikesheds it in PRs. Per-repo
> overrides are acceptable only if applied repo-wide by tooling.

---

## 3. Naming Conventions

Use the scheme native to each language, but be consistent within a repo.

| Construct | Convention | Example |
|-----------|------------|---------|
| Variables, functions | `camelCase` / `snake_case` (lang-specific) | `fetchUserData`, `calculate_proration` |
| Classes, structs, enums | `PascalCase` | `UserProfile`, `BillingError` |
| Constants, env vars | `SCREAMING_SNAKE_CASE` | `API_TIMEOUT_MS` |
| Files | `kebab-case`; `snake_case` where the language requires it (Python modules) | `user-profile.svelte`, `billing_service.py` |
| Boolean flags | Prefix with `is`, `has`, `should` | `isActive`, `hasPermission` |

---

## 4. Lifting & Architecture

- **Lift state up** when siblings share truth. Parent owns data; children receive props and emit events.
- **Lift logic out of UI/framework** into pure functions, services, composables, or modules. Framework code is glue, not business logic.
- **Lift infrastructure concerns** (logging, metrics, deployment) out of domain logic. Use dependency injection or middleware layers.
- **Push presentation down.** Keep components thin. Heavy logic belongs in co-located `lib/`, `services/`, or `domain/` modules.

---

## 5. Defensive Boundaries

Validate at every entry point. Never trust external data, even from internal services.

- **Type safety:** Use strict TypeScript (`strictNullChecks`), PHP 8.3+ enums/union types, Rust's type system, Python type hints (`from __future__ import annotations`).
- **Schema validation:** Use Zod, Valibot, or Effect Schema (JS/TS — prefer libraries implementing the [Standard Schema](https://standardschema.dev) interface), Form Requests (Laravel), Pydantic (Python), `serde` + custom validators (Rust).
- **Null/Option handling:**
  - TypeScript: never pass `null` "just in case"; use `undefined` for missing values explicitly.
  - Rust: prefer `Option<T>` and `Result<T, E>` over `unwrap()` in library/production code.
  - Python: avoid `None` as a sentinel; use `Optional[T]` explicitly and guard at call sites.
- **Error handling:** Return errors, don't swallow them. Log with `trace_id` at the boundary, then propagate or map to user-friendly messages.

---

## 6. Documentation That Lives With Code

Document **intent**, not mechanics. Mechanics are visible in the code; intent is not.

```php
/**
 * Calculates prorated refund for mid-cycle plan changes.
 * Business rule: refunds apply only if >7 days unused.
 * See: https://example.com/docs/billing-rules#proration
 */
```

- **README per module/service:** Entry points, data flow, and external dependencies.
- **ADRs:** Significant architectural decisions live in `/docs/adr/`. Required for: framework choice, database migrations, third-party service adoption, API contract changes.
- **Rust:** Every public API item (`pub`) must have a doc comment (`///`).
- **Python:** Every public module, class, and method must have a docstring (Google style).

---

## 7. Testing Standards

| Scope | Target | Notes |
|-------|--------|-------|
| **Unit** | Pure functions, no I/O | Coverage gate: 90% statements/functions/lines, 80% branches, enforced in CI. Fast (< 100ms per suite). |
| **Integration** | DB round-trips, API contracts | Test Laravel Form Requests, SvelteKit load functions, Rust handler layers, Python service layers. |
| **E2E** | Critical user paths only | Booking, payment, auth flows. Do not E2E-test every edge case. |

- **Test names** describe behaviour, not implementation: `it_refunds_prorated_amount_when_plan_changed_mid_cycle` not `test_refund_calc`.
- **One assert per concept** per test; multiple asserts are fine if they test one logical outcome.
- **Do not mock what you don't own.** Use real test containers (Testcontainers, Docker) for DB/cache dependencies where feasible.

---

## 8. Language-Specific Standards

### 8.1 JavaScript / TypeScript (Astro, Svelte, React)

- **Formatter:** Prettier 3. **Linter:** ESLint (flat config). Biome 2.5 is an accepted alternative for both — the logger packages ship config sets for each (§14.4).
- **Config:** `printWidth: 100`, `singleQuote: true`, `semi: false`, `trailingComma: "none"` — no semicolons, no trailing commas. Svelte/SvelteKit projects must include `prettier-plugin-svelte` so `.svelte` files are formatted too. The shipped Biome fragment (`@nocturna/logger/configs`) carries the same style (`semicolons: "asNeeded"`, `trailingCommas: "none"`).
- **TypeScript:** Enable `strict`, `strictNullChecks`, `noImplicitAny`, `noUncheckedIndexedAccess`.
- **Imports:** Absolute aliases for cross-module (`$lib/`, `@/`), relative for siblings (`./`).
- **Svelte:** One component per file. Co-locate styles unless using a shared design system. Prefer Svelte 5 runes (`$state`, `$derived`); extract shared state and logic to `.svelte.ts` modules. Legacy stores are acceptable only for interop.
- **Astro:** Islands for interactivity only. Keep content pages static where possible.
- **Project config:** Use `eslint.config.js` (flat config) and `prettier.config.js` — or `biome.json` — at repo root. See project templates for working examples.

### 8.2 PHP (Laravel)

- **Formatter:** Laravel Pint. **Linter:** PHPStan (level 8+).
- **One class per file.** PSR-4 autoloading strictly enforced.
- **Controllers:** Thin. Delegate to single-responsibility Action classes or Service classes. Target < 100 lines.
- **Models:** Business logic extracted to Actions/Observers; models define relationships, casts, scopes, and accessors only.
- **Validation:** Form Request classes for every non-trivial endpoint. No inline validation in controllers.
- **APIs:** OpenAPI specs first. Generate frontend types from spec.
- **Static enforcement:** commit a `phpstan.neon` at level 8+ so the floor is config-enforced, not convention.

### 8.3 Rust

- **Formatter:** `rustfmt` (`cargo fmt`). **Linter:** Clippy (`cargo clippy -- -D warnings`).
- **Error handling:** Use `thiserror` for library errors, `anyhow` for application glue. No `unwrap()` or `expect()` in production paths without a `// SAFETY:` comment justifying invariants.
- **Unsafe:** Prohibited without an ADR. Every `unsafe` block must have a `// SAFETY:` comment explaining why it is sound.
- **Modules:** One concept per module. Keep `lib.rs` / `main.rs` as a thin router/registry.
- **Documentation:** All `pub` items must have `///` doc comments with examples where non-obvious. Run `cargo doc` in CI and fail on warnings.
- **Dependencies:** Prefer the standard library. Audit new crates with `cargo audit`. Pin versions in `Cargo.lock`.
- **Iterators:** Prefer iterator chains over explicit loops where readability is maintained.
- **Async:** Prefer `tokio` for async runtimes. Explicitly document `Send`/`Sync` requirements for multi-threaded contexts.
- **Compile-time enforcement:** in `[lints.rust]` set `unsafe_code = "deny"`; in `[lints.clippy]` deny `unwrap_used`, `expect_used`, `print_stdout`, `print_stderr`. The ADR process may `allow` these per module.
- **Testing:** unit tests in `#[cfg(test)]` modules beside the code; cross-crate integration tests in `tests/`; async tests with `#[tokio::test]` — never block a runtime inside a test.

### 8.4 Python

- **Formatter & Linter:** `ruff` (replaces Black, isort, flake8, pydocstyle). **Type checker:** `mypy` (strict mode) or `pyright`.
- **Type hints:** Mandatory on all function signatures and class attributes. Use `from __future__ import annotations` to avoid string quoting.
- **Validation:** Use `pydantic` v2 at all system boundaries (API inputs, config parsing, env vars).
- **Path handling:** Use `pathlib.Path` over `os.path`.
- **Dependencies:** Lock with `uv.lock` (uv) or `poetry.lock` (Poetry). Never pin loosely in production.
- **Docstrings:** Google style. Every public module, class, and method.
- **Testing:** `pytest`. Test files as `test_*.py`; fixtures over setup/teardown methods.
- **Structure:** One class per file where possible. File length follows §2 with a 400-line comfort ceiling — split when a module grows a second concept, not to hit the number. Group related modules in packages with explicit `__init__.py` exports.
- **Lint enforcement:** select ruff groups `E, F, I, UP, B, SIM, TRY, T20, PTH` — `T20` bans `print`, `PTH` enforces `pathlib`, `B904` enforces `raise ... from`. Run `mypy` in strict mode in CI.
- **Coverage:** gate CI on `pytest --cov --cov-branch --cov-fail-under=90`.

---

## 9. Dependency & Import Hygiene

- **Import order:** Enforced by tooling (`ruff`, `eslint-plugin-import`, `rustfmt` import granularity). Do not manually sort.
- **Barrel files (`index.ts`, `__init__.py`, `mod.rs`):** Use for public API surfaces only. Avoid for internal leaf modules to prevent circular dependency traps.
- **No wildcard imports** (`from module import *`, `use module::*`) except in explicit `prelude` modules.
- **Minimal dependencies:** Audit before adding. Prefer standard library or existing transitive deps. Document why in the PR.
- **Supply-chain audits:** Run `cargo audit` (Rust), `npm audit` with Dependabot or Renovate (JS/TS), `composer audit` (PHP), and `pip-audit` (Python) in CI. Lockfiles are committed and enforced; justify every new dependency in its PR.

---

## 10. Observability & Logging

- **Structured logging is mandatory** — no `console.log` / `print()` / `dbg!()` in production
  application code. The canonical level set, logger contract, and reference packages are defined
  in §14; §14.10 lists the idiomatic library for non-TypeScript stacks.
- **Error reporting** uses a Sentry-compatible backend. When the DSN env var is absent, the
  service disables error reporting and starts normally. If error reporting is requested (DSN set)
  but initialization fails, the failure must be observable — logged to stderr, exposed on the
  handle, or cause boot to abort — never swallowed.
- **Configuration via code:** the logging level and error-reporting DSN resolve through the
  language-appropriate configuration layer, so tests can override them without mutating process
  env. (In the logger contract, an explicit `level` option wins over env detection — §14.2.)
- **Log levels:** use the six-level set in §14.1. `ERROR` and above forward to the
  error-reporting backend (§14.5).

---

## 11. Tooling Configuration

All projects must include these files at repository root:

| File | Purpose |
|------|---------|
| `.editorconfig` | Cross-editor consistency (indent, newline, charset) |
| `Makefile` / `justfile` / `package.json` scripts | Standard commands: `lint`, `test`, `format`, `typecheck` |
| `.pre-commit-config.yaml` or Husky | Run linters/formatters on staged files only |

Deployable application repos (services, not libraries) must also include:

| File | Purpose |
|------|---------|
| `docker-compose.yml` or `compose.yml` | One-command local environment |

---

## 12. Commit & PR Hygiene

- **Conventional Commits:** `type(scope): description`
  - Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
  - Example: `feat(billing): add prorated refund calculation`
- **PR size:** < 400 lines changed ideal. > 800 requires justification.
- **Self-review checklist:** Before requesting review, confirm lint, typecheck, and tests pass locally.

---

## 13. (Reserved)

Removed in v1.8. Worker job progress reporting is platform-specific, not a universal coding
standard — it now lives in the platform repository's own documentation. The section number is
retained so that §14 references in code comments across all implementations remain stable.

---

## 14. Structured Logging

Logging is **not optional** and is **never silent by design**. Every service, worker, and UI process
emits structured logs through a shared logger contract so behaviour is identical across the estate.

> **Canonical packages:** `@nocturna/logger` (core, zero runtime dependencies) and
> `@nocturna/logger-electron` (Electron-specific sinks and IPC bridge). Non-TypeScript stacks
> implement the same contract with the language-idiomatic library listed in §14.10.

### 14.1 Levels

Six levels, numerically spaced so new levels can be inserted without renumbering:

| Level | Value | Use for |
|-------|-------|---------|
| `SILENT` | `0` | **Tests only.** Emits nothing. Never a production default. |
| `DEBUG` | `10` | Development flow detail: variable values, branch entry/exit, function boundaries. |
| `INFO` | `20` | Business and lifecycle events. "server listening on :8000", "user subscribed", "migration applied". |
| `WARN` | `30` | Recoverable anomaly — degraded but continuing. Retry succeeded on attempt 2, deprecated API used, cache-miss fallback, config default applied. |
| `ERROR` | `40` | An **operation** failed. This unit of work did not complete, but the process is healthy and can serve other work. Requires investigation. |
| `CRITICAL` | `50` | The **process or a critical subsystem cannot continue correctly**. Data corruption, unrecoverable state, failed boot, connection pool exhausted, top-level unhandled rejection. Wake a human. |

> **ERROR vs CRITICAL — the deciding question:** did *one operation* fail, or is *the process* now
> untrustworthy? Operation → `ERROR`. Process → `CRITICAL`. When unsure, use `ERROR` and escalate on
> evidence.

### 14.2 Environment Thresholds

A level is emitted when `entry.value >= configured.value` — with one exception: **`SILENT` is a
disable switch, not a point on the severity scale.** When the configured level is `SILENT`, nothing
is emitted regardless of the numeric comparison. Implementations must special-case it; do not rely
on its numeric value of 0.

| Environment | Default | Emits | Detected by |
|---|---|---|---|
| Development | `DEBUG` | everything | `NODE_ENV=development`, `DEV=true`, `VITE_DEV_SERVER_URL` set |
| Test | `SILENT` | nothing | `NODE_ENV=test` — assert on logs, don't print them |
| **Production** | **`ERROR`** | **`ERROR` + `CRITICAL`** | everything else |
| Override | `LOG_LEVEL` | any level above | case-insensitive env var, wins over all defaults |

**Production is `ERROR`, never `SILENT`.** A silent production logger defeats the purpose of
logging: failures become invisible. This is the single most important rule in this section.

### 14.3 Logger Contract

Every implementation — whatever the language — must satisfy this contract:

- **Module-scoped factory.** `createLogger({ module, level?, sinks?, redact? })`. The module name is
  bound once at creation, not repeated on every call site.
- **One method per level:** `debug`, `info`, `warn`, `error`, `critical`.
- **Signature:** `(message: string, meta?: LogMeta) => void`.
- **Structured entries.** Sinks receive a `LogEntry` object — never a pre-formatted string:
  `{ timestamp, level, module, message, location?, traceId?, operation?, data?, error? }`.
- **Errors are first-class.** `meta.error` carries `{ name, message, stack, code? }`, not
  `String(err)` — never lose the stack trace.
- **Caller location** (`file:line`) captured where the runtime supports it.
- **The logger never throws.** A failing sink is reported to `stderr` and disabled; it must never
  crash the application it is observing.
- **Injectable.** Loggers are constructed, not imported as global singletons, so tests can substitute
  a capture sink.

### 14.4 No Swallowed Errors

Fail loud, fail fast. An error that is neither logged, rethrown, nor returned to the caller has not
been handled — it has been hidden.

**Every `catch` block must do at least one of:**
1. Log at `ERROR` or above, **or**
2. Re-throw (optionally wrapped in a typed error preserving `cause`), **or**
3. Return a typed error to the caller.

**Banned outright:**
- Empty catch blocks — `catch {}` / `catch (e) {}`
- Catch blocks whose only body is a comment — `catch (e) { /* ignore */ }`
- Catching purely to `return null`, `return undefined`, or a silent default
- `catch (e) { console.log(e) }` — routing through the logger or nothing

**If you must intentionally ignore**, log at `WARN` with a `// WHY:` comment justifying it. Silence
requires a written reason.

**Lint enforcement — ESLint (flat config):**

```js
// eslint.config.js
export default [
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'all' }],
      'no-console': ['error', { allow: [] }] // app code must use the logger; disable inside the logger itself
    }
  }
]
```

**Lint enforcement — Biome (2.5):**

```jsonc
{
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "suspicious": {
        "noEmptyBlockStatements": "error",
        "noConsole": { "level": "error", "options": { "allow": [] } }
      },
      "correctness": {
        "noUnusedVariables": "error"
      }
    }
  }
}
```

> **Coverage caveat:** Biome's `noEmptyBlockStatements` catches `catch {}`, but static analysis for
> `catch (e) { /* ignore */ }` and silent-default returns is weaker than ESLint's. Repos on Biome
> must treat swallowed errors as an explicit review checklist item (§12) until the toolchain covers
> it. The `@nocturna/logger` packages ship both configs.

### 14.5 Sinks

| Sink | Applies to | Notes |
|------|-----------|-------|
| **Console** | All | Browser: coloured module badge + level icon. Node: ANSI colour + timestamp. Human-readable by default. |
| **File** | **Server-side / Node apps, and desktop (Electron)** | Required wherever no log aggregator is present. See §14.7. |
| **Structured stdout** | Servers, containers | When `LOG_FORMAT=json`, emit one JSON object per line. This is the production default for containerised services — let the platform collect it. |
| **Error reporting** | All | Forwards `ERROR`+ to the §10 error-reporting backend. |

> **Do not build a file sink into browser or renderer code.** There is no filesystem. Renderer logs
> forward to the main process over IPC (§14.9) or go straight to the console sink.

### 14.6 Redaction (Mandatory)

Redaction runs **before every sink, always on** — it is not opt-in.

- **Default redacted keys** (case-insensitive, applied recursively to `meta.data` and `meta.error`):
  `token`, `password`, `passwd`, `pwd`, `secret`, `credential`, `authorization`, `bearer`,
  `api[-_]?key`, `apikey`, `access[-_]?key`, `private[-_]?key`, `cookie`, `session`, `jwt`, `otp`.
- **Match semantics:** patterns match as case-insensitive *substrings* of the key, not exact keys —
  `sessionId` and `sessionCount` both match `session`. Over-redaction is accepted by design;
  under-redaction is not.
- Values are redacted by key only — never by matching string content.
- Redacted values are replaced with `[REDACTED]` — never truncated-but-partial.
- **Never log** full request/response bodies at `INFO` or above, credentials, or PII (emails, phone
  numbers, addresses) unless a documented requirement forces it.
- Projects may extend the pattern list via `redact.additionalPatterns`. They may **not** disable it.

### 14.7 Retention & Rotation (File Sinks)

- **Rotate daily:** `app-YYYY-MM-DD.log`.
- **Prune** files older than the retention window: **14 days** for server-side, **7 days** for
  desktop installs.
- **Cap total size** (default 100 MB per log directory). When exceeded, prune oldest first.
- **Log directory** is provided by the host, never hard-coded:
  - Servers: `LOG_DIR` env var, default `./logs`
  - Electron: `app.getPath('userData')/logs`
- Pruning failures are logged at `WARN` — a full disk must not crash the app.

### 14.8 Global Handlers — Fail Loud at the Edge

Install at the entry point, **before any other work**:

| Runtime | Handler | Action |
|---------|---------|--------|
| Node / server | `process.on('unhandledRejection')` | Log `CRITICAL`, then exit non-zero |
| Node / server | `process.on('uncaughtException')` | Log `CRITICAL`, then exit non-zero |
| Browser / renderer | `window.onerror`, `unhandledrejection` | Log `CRITICAL`, surface to user |
| Electron main | All of the Node handlers | Log `CRITICAL`, then exit non-zero |

A process that cannot honour its invariants should die loudly and be restarted by the supervisor —
not limp along in an unknown state.

### 14.9 Reference Implementation

**`@nocturna/logger`** — core, **zero runtime dependencies**, works in Node and the browser:

- `createLogger({ module, level?, sinks?, redact? })`
- Level set, thresholds and `LOG_LEVEL` resolution per §14.1–14.2
- `consoleSink`, `fileSink` (with rotation + retention per §14.7), JSON/structured sink
- Mandatory redaction per §14.6
- Ships both the ESLint flat config and the Biome config from §14.4

**`@nocturna/logger-electron`** — extends the core for Electron only:

- Default file sink directory: `app.getPath('userData')/logs`
- `createIpcLogHandler(logger)` for the main process
- `createRendererLogger()` — renderer logs forward to main over the preload bridge, so all
  output lands in one file
- Main-process global handlers per §14.8
- `electron` declared as a **`peerDependency`**

**Reference implementations for other stacks** — each mirrors the TS contract and formats
byte-for-byte; parity fixtures are asserted in every language's test suite:

| Package | Stack | Notes |
|---|---|---|
| `nocturna-logger` (`logger/rust-cli/`) | Rust CLI / server | `create_logger(LoggerOptions)`, `#[track_caller]` locations, panic hook per §14.8; deps: chrono, regex, serde_json |
| `nocturna-logger-tauri` (`logger/rust-tauri/`) | Rust + Tauri desktop | file sink defaults to `app_data_dir()/logs` (7-day retention), webview→main IPC command `nocturna_log` with per-module logger cache |
| `nocturna-logger` (`logger/python/`) | Python | `create_logger(module, ...)`, `sys.excepthook` + `threading.excepthook` handlers per §14.8; stdlib only |
| `nocturna/logger` (`logger/php/`) | PHP 8.1+ | `LoggerFactory::create(LoggerOptions)`, `$log(...)` invoke shorthand, exception/error/shutdown handlers per §14.8; ext-json only |

All six packages share one version across releases (enforced by the version-parity check in CI
and `scripts/check-versions.mjs`). Distribution: the TypeScript, Python, and Rust packages
publish to private npm, PyPI, and Cargo registries on the OneDev host; the PHP package has no
Composer registry — **git tags are its distribution**, and remain a fallback for the others
(see README, "Installing the Loggers").

> **Dependency direction is one-way:** the core package must never import Electron. Host-specific
> packages (`logger/electron/`, `logger/rust-tauri/`) depend on the core — never the reverse.

### 14.10 Non-TypeScript Stacks

All TypeScript and JavaScript projects — Node, browser, Vite, Nuxt, SvelteKit, Next — use
`@nocturna/logger` directly. The package ships CJS, ESM, and type declarations, so it works
even in pure-JavaScript Node projects without a build step.

For stacks that are genuinely not JavaScript, use the reference implementation for that stack
(§14.9): `nocturna-logger` (Rust), `nocturna-logger-tauri` (Tauri), `nocturna-logger` (Python),
or `nocturna/logger` (PHP). If a project must use the language-idiomatic library instead
(tracing, structlog, monolog), it must implement §14.3's contract with the same level set,
the same `ERROR` production floor, and the same no-swallowed-errors rules:

| Stack | Library | Notes |
|-------|---------|-------|
| PHP | `monolog` | JSON formatter; custom processor for redaction |
| Rust | `tracing` + `tracing-subscriber` | `tracing-appender` for daily rotation |
| Python | `structlog` | `structlog.configure()` with a redaction processor |

All must honour the same level set, the same `ERROR` production floor, and the same
no-swallowed-errors rules.

### 14.11 Log Coverage & Verbosity

- **Log everywhere.** Every module logs through the shared logger — not just boundaries and
  error paths. A component that can fail silently, make a decision, or change state logs it.
- **Levels are binding, not advisory.** Choose per §14.1's deciding questions; mislevelled
  events (a failed operation at `WARN`, routine flow at `INFO`) are defects.
- **DEBUG must be genuinely verbose.** Enabling debug logging (§14.2) should let you trace
  execution end-to-end without a debugger: module/function entry and exit, branch decisions
  and why, relevant variable values, timings, retry attempts. If turning on `DEBUG` doesn't
  materially help you diagnose a misbehaving service, the instrumentation is insufficient —
  add it before you need it, not during the incident.
- **Verbosity is free at rest.** `DEBUG` entries are filtered out above the threshold, so
  they cost nothing in production. Clean production logs come from the level floor, not from
  sparse instrumentation — never self-censor `DEBUG` calls "to keep the logs clean".

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| 1.11.0 | 2026-11-28 | §2 file length is explicitly not a hard limit — split only when a natural conceptual split exists (§8.4 Python ceiling softened to match). New §14.11 log coverage & verbosity: every module logs, level choices per §14.1 are binding, and DEBUG must be verbose enough to trace execution end-to-end. |
| 1.10.0 | 2026-11-28 | §8.1 style rule changed: no semicolons (`semi: false`) and no trailing commas (`trailingComma: "none"`) replace the es5 comma rule; the shipped Biome fragment now carries matching formatter settings. |
| 1.9.1 | 2026-11-28 | §14.9 distribution note corrected: the OneDev host does run PyPI and Cargo registries — Python and Rust packages publish there (git tags remain the distribution for PHP and a fallback for the rest). No rule changes. |
| 1.9.0 | 2026-11-27 | Distribution: symlink model replaced — the doc is now installed as a stamped, read-only snapshot via the `@nocturna/standards` npm package, the `nocturna-standards` cargo CLI, or `standards/agents/install.sh`; header rewritten accordingly. Versioning: switched to semver (X.Y.Z) and this header is now the single source of truth for the standards version — `agents/VERSION` retired; the installer stamp and both installer packages derive from it. |
| 1.8 | 2026-11-27 | §14.2: `SILENT` documented as a disable switch, not a numeric comparison; dev-detection signals corrected (`VITE_DEV_SERVER_URL`, not `process.dev`). §14.4: Biome config mirrors the shipped fragment (`noConsole` with `allow: []`, 2.5 schema). §14.6: substring key-match semantics specified (over-redaction by design); redaction covers `meta.error`. §14.9: registry labels corrected — Rust/Python/PHP distribute via git tags. §7: coverage floor raised to 90/80. §10: de-platformed (Bugsink/Uptrace narrative removed) and now points to §14. §13 removed (platform-specific; number reserved). §8.4: misplaced TypeScript bullet removed; Python file ceiling reconciled with §2. §3, §8.1, §11, §12 aligned with practice. |
| 1.7 | 2026-08-29 | §14 Structured Logging: canonical level set, prod=ERROR floor, no-swallowed-errors rule + lint configs, redaction, file sink retention, global handlers. Canonical location directive (symlink, not copy). Reference `@nocturna/logger` + `@nocturna/logger-electron` packages. |
| 1.6 | 2026-08-29 | §10 Added Uptrace upgrade path (full observability: traces, metrics, logs, alerting) for when platform outgrows Bugsink. |
| 1.5 | 2026-08-26 | §10 Switched from OpenTelemetry-first to Sentry/Bugsink error reporting; added configuration-layer and fail-loudly guidance. |
| 1.4 | 2026-07-31 | §13 Worker Job Progress Reporting (binding rule: every `JobDefinition` emits standardized progress per `design/infrastructure/job-progress-reporting.md`). |
| 1.3 | — | *Entry not recorded — gap in changelog history.* |
| 1.2 | 2026-07-11 | §8.1 Prettier 3 + mandatory `prettier-plugin-svelte` (`trailingComma: "es5"` and `printWidth: 100` retained); §2 line length explicitly delegated to formatters. |
| 1.1 | 2026-07-11 | PHP floor → 8.3 (§5); Effect Schema / Standard Schema (§5); Svelte 5 runes (§8.1); OpenTelemetry-first observability (§10); supply-chain audits (§9). |
| 1.0 | — | Initial version |

---

*Violations of these standards caught in CI will block merge. When in doubt, prefer the boring, obvious solution over the clever one.*
