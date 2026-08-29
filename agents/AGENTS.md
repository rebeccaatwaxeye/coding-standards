# Coding Standards — Agent Reference

> **Load the language slice matching the file you are editing.** This file holds universal rules only; language rules are not repeated here.
>
> · `rules/typescript.md` · `rules/php.md` · `rules/rust.md` · `rules/python.md` ·
>
> Version 1.7 · Canonical human-readable source: `~/Code/coding-standards/CODING_STANDARDS.md`

---

## 1. Philosophy

- **Explicit over implicit.** Untraceable in 30 seconds is too clever.
- **Fail fast, fail loudly.** Validate at every system boundary.
- **Tooling > willpower.** Formatters decide syntax; humans decide architecture.
- **One purpose per function. One concept per file.**

---

## 2. Universal Heuristics

| Concern | Rule |
|---|---|
| Function length | ≤ 30 lines ideal; 50 hard ceiling |
| Function purpose | Name must not contain "and" or "or" |
| File length | 200–400 lines comfort; 500+ requires justification |
| Nesting depth | ≤ 3 levels — flatten via early return or extraction |
| Parameters | ≤ 4 positional; use object/struct beyond that |
| Cyclomatic complexity | ≤ 10 per function |

**Line length is absent by design.** Each language pins one `printWidth`; the formatter enforces it. Never raise it in review.

---

## 3. Naming

- Reveal intent. `getUserByEmail()`, not `getU()`.
- Booleans read as assertions: `isActive`, `hasPermission`, `canEdit`.
- No abbreviations except universally known ones (`id`, `url`, `db`).
- One word per concept across the codebase. Do not mix `fetch`/`get`/`retrieve`.
- Name the abstraction, not the implementation. Avoid `Impl`, `Manager`, `Helper`, `Util` unless genuinely generic.

---

## 4. Lifting & Architecture

- **Rule of Three.** Extract on the third duplication, not the first.
- **Lift, don't tunnel.** When two callers need the same variant logic, lift the decision to the caller and take a parameter. Do not add a boolean flag that threads through layers.
- **One level of abstraction per function.** Do not mix high-level orchestration with low-level detail.
- Prefer composition over inheritance.

---

## 5. Defensive Boundaries

Validate at every boundary where data enters: HTTP handlers, queue consumers, CLI args, env vars, file reads, third-party responses.

- **Fail fast.** Reject invalid input at the edge; do not carry it inward and defend repeatedly.
- **Never swallow.** An empty `catch` is a defect. Log, rethrow, or return a typed error.
- Distinguish **expected** failures (validation, not-found — typed result, no stack) from **exceptional** ones (bug, outage — throw, log with stack).

---

## 6. Documentation

- Document **why**, not **what**. The code already says what.
- Public APIs get doc comments. Private helpers do not.
- Do not leave commented-out code. Version control is the archive.
- Update docs in the same commit as the code change.
- No `TODO` without a ticket reference and owner.

---

## 7. Testing

- Test **behaviour**, not implementation. Refactoring internals must not break tests.
- AAA: Arrange → Act → Assert.
- One logical assertion per test; clear names describing behaviour.
- Cover happy path, edge cases, and error cases.
- **Do not mock what you don't own.** Use real containers (Testcontainers) for DB/cache where feasible.
- A bug fix lands with a regression test that fails before the fix.

---

## 8. Dependency & Import Hygiene

- No new dependency without justification. Prefer the standard library.
- No unused imports, variables, or parameters. Delete dead code — do not comment it out.
- Absolute aliases for cross-module imports (`$lib/`, `@/`); relative for siblings (`./`).
- Lockfiles are committed and authoritative. Never pin loosely in production.

---

## 9. Structured Logging

### 9.1 Levels

| Level | Value | Use for |
|---|---|---|
| `SILENT` | 0 | **Tests only.** Emits nothing. Never a production default. |
| `DEBUG` | 10 | Development flow detail: variable values, branch entry/exit. |
| `INFO` | 20 | Business and lifecycle events. "server listening", "user subscribed". |
| `WARN` | 30 | Recoverable anomaly — degraded but continuing. Retry succeeded, deprecated API used. |
| `ERROR` | 40 | An **operation** failed. Process is healthy and can serve other work. |
| `CRITICAL` | 50 | The **process or subsystem cannot continue**. Data corruption, failed boot, pool exhausted. Wake a human. |

**ERROR vs CRITICAL — the deciding question:** did *one operation* fail, or is *the process* now untrustworthy? Operation → `ERROR`. Process → `CRITICAL`. When unsure, use `ERROR` and escalate on evidence.

### 9.2 Thresholds

| Environment | Default | Emits |
|---|---|---|
| Development | `DEBUG` | everything |
| Test | `SILENT` | nothing — assert on logs, don't print them |
| **Production** | **`ERROR`** | **`ERROR` + `CRITICAL`** |
| Override | `LOG_LEVEL` | case-insensitive env var, wins over all defaults |

**Production is `ERROR`, never `SILENT`.** Silencing production logs to reduce noise hides the failures you most need.

### 9.3 Logger Contract

- **Structured, never concatenated.** Pass context as a data object, not a template string.
- Context travels as fields. `traceId` correlates related operations.
- Use the project logger, never `console.*` / `print()` / `fmt.Println` in application code.
- Callers do not pass level, module, or timestamp — the logger injects these.

### 9.4 No Swallowed Errors

**These are the most common defects in generated code.** Never emit them:

| Anti-pattern | Why it is wrong | Do this instead |
|---|---|---|
| `catch (e) {}` | Error vanishes; no evidence it happened | Log with context, or rethrow |
| `catch (e) { return null }` | Caller cannot distinguish empty from broken | Return a typed failure the caller must handle |
| `catch (e) { console.log(e) }` | Not structured, not level-gated, not in logs | `log.error('...', { error: e })` |
| `catch (e) { throw new Error('failed') }` | Destroys the cause, stack, and error code | Wrap and preserve `cause`; log with context |
| `String(err)` | Collapses name, stack, and code into one string | Pass the error object; it serialises to structured fields |
| Default-after-log | Logs then proceeds as if nothing happened | Fail or degrade explicitly and return that state |
| `.catch(() => {})` | Silently discards async rejection | `.catch((e) => log.error('...', { error: e }))` |

When catching to add context, **preserve the cause** (JS `cause`, Python `raise ... from e`, Rust `source`).

### 9.5 Redaction (Mandatory)

Never log: passwords, tokens, secrets, credentials, API keys, authorization headers, cookies, session IDs, JWTs, OTPs, private keys.

This is enforced by the logger, not by caller discipline. Do not disable it.

### 9.6 Retention & Global Handlers

- File sinks rotate daily and prune by age and total size.
- Install top-level `unhandledRejection` / `uncaughtException` handlers: log `CRITICAL`, flush, exit non-zero.

---

## 10. Commit & PR Hygiene

- **Conventional Commits:** `type(scope): description`. Header ≤ 72 chars, imperative mood, no trailing period.
- Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **One logical change per commit.** Never mix formatting with behaviour — it defeats review and bisect.
- Body explains why, not what. Wrap at 72 chars.
- If a commit cannot be described without "and", split it.

---

## 11. Code Review

Review **behaviour**, not syntax — tooling owns syntax.

- Verify the change does what the description claims.
- Confirm error paths are reachable and handled.
- Flag new dependencies for justification.
- Ask for split-out when formatting changes are mixed with behaviour.
- Do not approve without understanding the change.

---

## 12. Worker Job Progress Reporting

Long-running jobs report progress so operators can distinguish stalled from slow.

- Emit progress at meaningful checkpoints: `queued`, `started`, `progress`, `completed`, `failed`.
- Include `jobId`, counts done/total, and current phase.
- A job that emits nothing for longer than its heartbeat is considered stalled.
