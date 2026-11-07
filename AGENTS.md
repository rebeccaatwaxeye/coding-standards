# AGENTS.md — Guide for AI Agents Working in This Repo

## What This Repo Is (Dual Purpose)

This repository is **not a normal application**. It contains two distinct deliverables that share one repo:

1. **The Coding Standards documents** (the primary product):
   - `CODING_STANDARDS.md` — the canonical, human-written standards document (~460 lines, §-numbered sections). **This is the source of truth.**
   - `agents/` — an agent-optimised rewrite of the same standards: `agents/AGENTS.md` (core rules), `agents/rules/{typescript,php,rust,python}.md` (lazy-loaded language slices), and `agents/install.sh` (copies them into *other* repos and generates `.cursorrules`).

2. **The reference implementation** of the standards' structured-logging spec (§14.9), as a pnpm workspace:
   - `node/` → `@nocturna/logger` — zero-dependency core logger (Node + browser)
   - `electron/` → `@nocturna/logger-electron` — IPC bridge, file sink, global handlers
   - `node/configs/` → shippable lint config snippets (`@nocturna/logger/configs` export) enforcing §14.4

Packages publish to a private OneDev npm registry (`nocturna.dev`), not npmjs. `README.md` covers the same ground for humans; this file focuses on what agents trip over.

## Critical Gotcha: Two Different AGENTS.md Files

`agents/AGENTS.md` is **shipped content** installed into consumer repos — it is NOT the agent guide for this repo (this file is). When standards change:

1. Edit `CODING_STANDARDS.md` first (canonical — it wins on any disagreement).
2. Mirror the change into `agents/AGENTS.md` and the relevant `agents/rules/*.md` slice.
3. Consumers re-run `agents/install.sh` themselves; do not regenerate `.cursorrules` here.

Note that `install.sh` rewrites relative paths (`rules/X.md` → `agents/rules/X.md`) when copying, so the slice references in `agents/AGENTS.md` are intentionally written as `rules/X.md`.

## Commands

No root `package.json` exists — only `pnpm-workspace.yaml`. All package work happens via filters from the repo root:

```bash
corepack enable                                    # pnpm via corepack (matches CI)
pnpm install --frozen-lockfile                     # install

pnpm --filter @nocturna/logger typecheck           # tsc --noEmit
pnpm --filter @nocturna/logger test                # vitest run
pnpm --filter @nocturna/logger test:watch
pnpm --filter @nocturna/logger build               # tsup (cjs + esm + dts, clean)
pnpm --filter @nocturna/logger lint                # biome check src/
pnpm --filter @nocturna/logger format              # biome format --write src/

# Same scripts exist for @nocturna/logger-electron
```

Local dev order matters: **build the core package before running electron typecheck or tests** — electron resolves `@nocturna/logger` types and runtime through core's `dist/` output. From a fresh clone:

```bash
pnpm --filter @nocturna/logger build     # first, always
```

Before finishing any change, run lint, typecheck, test, and build for **both** packages — that is exactly what CI (`.onedev-buildspec.yml`, OneDev) does on every branch update, in the order lint → build → typecheck → test.

### CI / Publishing Gotchas

- The buildspec writes `@@nocturna/logger` with a **double @**. That is OneDev escaping of the `@` scope character, not a typo — several commits exist solely to fix this escaping. Do not "correct" it to a single `@`.
- Publishing triggers on `v*` tags. The publish step builds and publishes **core first, then electron** — order matters because electron's `workspace:*` dependency on core must resolve to a concrete version.
- Bump `version` in **both** `package.json`s together before tagging — a `check-versions` step fails the Publish job on mismatch.
- v0.1.0 was tagged before the CI fixes above and never published; the first proven release is v0.1.1.

## Architecture: The Logger

### Core data flow (`node/`)

`createLogger()` → `write()` pipeline, in this order:

1. **Level filter** — `resolveLevel()` priority: explicit option → `LOG_LEVEL` env (case-insensitive) → environment detection (`NODE_ENV=test` → SILENT, dev signals → DEBUG, else ERROR). Sinks receive only entries passing `shouldLog()`.
2. **Entry build** — a `LogEntry` is assembled (`buildEntry`), including caller `file:line` extracted from a stack-trace scan.
3. **Redaction** — always runs, cannot be disabled by default. Key-based, recursive, case-insensitive; matching keys become `[REDACTED]`. Never redact by string value, only by key.
4. **Sinks** — each active sink's `write(entry)` is called. **A sink must never throw**: the logger catches, reports to stderr, and permanently disables that sink.

Non-obvious invariants baked into the design:

- **`SILENT` is a disable switch, not a severity point.** `shouldLog()` special-cases it instead of using the numeric scale, because value 0 would pass every `>=` comparison. Don't refactor this into a plain numeric comparison.
- Level numeric values are spaced by 10 so new levels can be inserted without renumbering.
- Callers never format output; **sinks own formatting** (`format.ts`: plain-text for files, JSONL for structured, ANSI for Node console, CSS-badge args for browser console).
- `LogError` preserves `{ name, message, stack, code }` — never `String(err)`.
- Source imports use **`.js` extensions** inside `.ts` files (`./types.js`) — required for the dual cjs/esm tsup build. Follow this pattern in new files.
- Dependency direction is **one-way**: core (`node/`) must never import Electron or anything Electron-specific; `electron/` depends on core via `workspace:*` and declares `electron >= 20` as a peerDependency.

### Electron data flow (`electron/`)

```
renderer: createRendererLogger(module)
  → window.__nocturnaLog()   (exposed by preload via contextBridge)
  → ipcRenderer.send('@nocturna/logger/log', payload)
  → main: createIpcLogHandler(factory)   (caches one logger per renderer module)
  → shared sinks (console + electronFileSink) — main and renderer logs land in one file
```

- The preload bridge falls back to plain `console[level]` in the renderer if the bridge isn't loaded yet.
- The IPC channel name lives in **one place**: `src/ipc-channel.ts`, imported by both `preload.ts` and `ipc-handler.ts` (which are separate build entries and cannot import each other). `ipc-handler.ts` re-exports it to preserve the public import path.
- `electronFileSink` wraps core `fileSink` with default dir `app.getPath('userData')/logs` and **7-day** retention (core default is 14 days).
- `installGlobalHandlers` logs CRITICAL then exits(1) after a 200ms `setTimeout` to let sinks flush.
- `createIpcLogHandler` takes a **factory**, not a logger, so each renderer module keeps its own module name.

### Shipped configs (`node/configs/`)

`eslint.flat.js` / `eslint.flat.d.ts` / `biome.json` are **products** exported via the `./configs` package export for consumer projects. The Biome fragment targets Biome 2.5 (`noConsole` with `allow: []`, banning all `console.*` — matching the ESLint twin's `'no-console': ['error', { allow: [] }]`).

This repo also dogfoods lint: each package root has a `biome.json` (schema 2.5.11, `preset: recommended` plus §14.4's `noEmptyBlockStatements` and `noUnusedVariables` as errors; single quotes, no semicolons, `lineWidth: 100` to match the codebase style). One deliberate divergence from the shipped fragment: the dev configs **omit the `noConsole` rule** because the logger legitimately uses `console.*` (console sink, renderer fallback) — the shipped ESLint snippet notes the same exception for "the logger package itself". `style/noNonNullAssertion` is also off; tests rely on `!` after setup where narrowing is impractical.

## Code Conventions

- **Doc-comment style**: every module opens with a JSDoc header naming the package and a usage `@example`; exported functions explain contract and defaults. Comments frequently cite the standards document by § number (e.g. "§14.8 — Global error handlers"). Preserve and follow this practice.
- **TypeScript**: `strict`, `noUncheckedIndexedAccess`, `noImplicitAny`, ES2022 target, `moduleResolution: bundler`. Index access returns `T | undefined` — guard or use non-null assertions only when provably safe (existing code uses `mock.calls[0]!` in tests).
- **Formatting**: single quotes, no semicolons in existing source (Biome defaults were applied). Match surrounding style.
- **Naming**: files are kebab-case (`electron-file-sink.ts`); sinks are `xxxSink()` factory functions returning a `Sink` object; types use `Log*` prefix (`LogEntry`, `LogMeta`, `LogError`).
- **Barrels**: `src/index.ts` is a hand-written barrel grouping exports by section (`// --- Types ---` etc.). Add new exports there; coverage config excludes barrels.

## Testing Patterns

- Tests are **colocated** as `*.test.ts` next to the source. Vitest with `globals: true`, but existing tests import `describe/it/expect/vi` explicitly — keep that.
- **Electron mocks**: every electron module test starts with `vi.mock('electron', () => ({...}))` (and `vi.mock('@nocturna/logger', ...)` where needed), restoring with `vi.restoreAllMocks()`. Use `vi.resetModules()` when testing module side effects (preload auto-exposes the bridge on import — tests use dynamic `await import('./preload.js')`).
- **Logger tests** use a `captureSink()` helper (a `Sink` that pushes entries into an array) and save/restore `NODE_ENV` / `LOG_LEVEL` in `beforeEach`/`afterEach` because level resolution reads env vars.
- Coverage excludes `src/index.ts` (barrel) and `src/types.ts` (electron only).
- Both packages enforce coverage thresholds on every test run (90% statements/functions/lines, 80% branches) — `pnpm --filter <pkg> test` fails below them because the test script runs `vitest run --coverage`.
- `src/configs.test.ts` pins the `@nocturna/logger/configs` export contract: if `configs/eslint.flat.js` changes, update this test and the hand-maintained `configs/eslint.flat.d.ts` together.
- Note the tsconfig asymmetry: `node/tsconfig.json` excludes `**/*.test.ts` from typecheck, `electron/tsconfig.json` does not — electron test files are typechecked.

## Non-Obvious Trivia

- `node/cjs/`, `node/esm/`, `node/ts/` are empty, gitignored leftovers from an earlier build setup — ignore them; real output goes to `dist/` via tsup.
- `pnpm-workspace.yaml` sets `onlyBuiltDependencies: [esbuild]` and `ignoredBuiltDependencies: [electron]` — electron's postinstall (a large binary download) is deliberately skipped; dev work only needs its type declarations and the tests mock the `electron` module.
- Repo history is short; feature commits use conventional-commit style (`feat(logger):`, `fix(ci):`, `feat(agents):`).
