# AGENTS.md — Guide for AI Agents Working in This Repo

## What This Repo Is (Dual Purpose)

This repository is **not a normal application**. It contains two distinct deliverables, kept in two top-level folders:

1. **`standards/` — the Coding Standards** (the primary product):
   - `standards/CODING_STANDARDS.md` — the canonical, human-written standards document (~470 lines, §-numbered sections). **This is the source of truth**, and its `**Version:**` header is the single source of truth for the standards version.
   - `standards/agents/` — an agent-optimised rewrite of the same standards: `AGENTS.md` (core rules), `rules/{typescript,php,rust,python}.md` (lazy-loaded language slices), `install.sh` (bash installer), `bootstrap.sh` (self-fetching curl installer).
   - `standards/npm/` — `@nocturna/standards` npm package: a zero-dep Node CLI (`nocturna-standards install|status`) that installs the same files.
   - `standards/cli/` — `nocturna-standards` cargo CLI (same commands, content embedded via `include_str!`), installed with `cargo install --git`.

2. **`logger/` — the reference implementations** of the standards' structured-logging spec (§14.9) — one per stack, all sharing one version per release and producing **byte-identical output** (parity fixtures asserted in every test suite):
   - `logger/node/` → `@nocturna/logger` — zero-dependency core logger (Node + browser)
   - `logger/electron/` → `@nocturna/logger-electron` — IPC bridge, file sink, global handlers
   - `logger/node/configs/` → shippable lint config snippets (`@nocturna/logger/configs` export) enforcing §14.4
   - `logger/rust-cli/` → `nocturna-logger` (Rust crate) — core; deps: chrono, regex, serde_json
   - `logger/rust-tauri/` → `nocturna-logger-tauri` — app-data sink (7-day retention), webview→main IPC command `nocturna_log`, re-exports the core
   - `logger/python/` → `nocturna-logger` (PyPI-style, stdlib only) — `create_logger`, excepthook handlers
   - `logger/php/` → `nocturna/logger` (Composer, ext-json only) — `LoggerFactory::create`, `$log(...)` shorthand

Packages publish to private OneDev registries (`nocturna.dev`): npm for TypeScript, PyPI for Python, Cargo for Rust. PHP has no Composer registry — git tags are its distribution. `README.md` covers the same ground for humans; this file focuses on what agents trip over.

## Critical Gotcha: Two Different AGENTS.md Files

`standards/agents/AGENTS.md` is **shipped content** installed into consumer repos — it is NOT the agent guide for this repo (this file is). When standards change:

1. Edit `standards/CODING_STANDARDS.md` first (canonical — it wins on any disagreement). Bump its `**Version:**` header (semver X.Y.Z) — that header is the **only** place the standards version is set; `agents/VERSION` no longer exists.
2. Mirror the change into `standards/agents/AGENTS.md` and the relevant `standards/agents/rules/*.md` slice.
3. Release with `./scripts/release-standards.sh` — it syncs `standards/npm/package.json` and `standards/cli/Cargo.toml` to the doc version, runs the gates, commits, and tags `standards-vX.Y.Z`. Consumers detect stale installs via `status` (non-zero exit).
4. Consumers update via their package manager (`pnpm update @nocturna/standards`, newer `--tag`/`--ref`) and re-run `install`; do not regenerate `.cursorrules` here.

Note that all three installers (bash `install.sh`, the npm bin, the cargo CLI) produce **byte-identical output** — stamp line, path rewriting (`rules/X.md` → `agents/rules/X.md`), `standards.json` shape, and `.cursorrules` header. Change the format in one and you must change all three (`standards/agents/install.sh`, `standards/npm/lib/install.mjs`, `standards/cli/src/lib.rs`); each has tests asserting the shared contract. The standards version is independent of the logger package versions.

## Commands

The root `package.json` pins pnpm (`packageManager`, so corepack is deterministic in CI) and exposes workspace scripts that run in the right order:

```bash
pnpm install --frozen-lockfile
pnpm build        # logger packages, core first (topological order)
pnpm test         # builds first, then tests with coverage gates
pnpm typecheck    # builds first, then tsc --noEmit in both packages
pnpm lint         # biome check in all JS packages
pnpm format
```

The build-chaining matters: electron resolves `@nocturna/logger` types and runtime through core's `dist/` output. Equivalent per-package commands (`pnpm --filter @nocturna/logger-electron <script>`) also exist (build, test, test:watch, typecheck, lint, format).

Other languages have no root scripts — run them in their directories:

```bash
(cd logger/rust-cli && cargo test && cargo clippy --all-targets -- -D warnings && cargo fmt --check)
(cd logger/rust-tauri && cargo test)          # depends on rust-cli via path; tauri is default-features=false
(cd standards/cli && cargo test)              # installer CLI; version test pins Cargo.toml to the doc
(cd logger/python && python -m pytest --cov=nocturna_logger --cov-branch --cov-fail-under=90)
(cd logger/python && ruff check .)            # §8.4 slice config lives in pyproject.toml
(cd logger/php && composer install && vendor/bin/phpunit)
```

Before finishing any change, run lint, build, typecheck, and test for the packages you touched — that is what CI (`.onedev-buildspec.yml`, OneDev) runs on every branch update as **four parallel jobs**: `ts` (install → lint → build → typecheck → test — build must precede typecheck/test because electron resolves core through `dist/`), `rust` (fmt/clippy → test in one job so the cargo target dir is shared), `python` (ruff → pytest), and `php` (phpunit). A husky pre-commit hook runs `pnpm -r run lint` as a commit-time gate.

Logger releases: `./scripts/release.sh X.Y.Z` bumps **all six** logger manifests (npm ×2, Cargo ×2, pyproject, composer), runs the TS release gate, commits `chore(release): vX.Y.Z`, and creates the tag. `scripts/check-versions.mjs` (run by the Publish job) fails the release if any manifest drifts — it checks both the logger parity group and the standards group against the doc. Pushing a `v*` tag triggers Publish — TypeScript goes to the OneDev npm registry, Python to its PyPI registry, Rust to its Cargo registry; PHP has no registry (OneDev can't host composer) — **git tags are its distribution**, and remain a fallback for the rest, documented in README "Installing the Loggers". The root `Cargo.toml` (virtual workspace) and root `composer.json` exist purely so those git installs can resolve the packages; don't remove them.

**Rust parity rules:** every language's `format_*`/sink behaviour mirrors `logger/node/src/format.ts` and `logger/node/src/create-logger.ts` — when changing a format, update the parity fixtures in ALL languages' test suites (they assert the same expected strings). SILENT-as-disable-switch, sink-failure disabling, and mandatory redaction are load-bearing invariants, not implementation details.

### CI / Publishing Gotchas

- The buildspec writes `@@nocturna/logger` with a **double @**. That is OneDev escaping of the `@` scope character, not a typo — several commits exist solely to fix this escaping. Do not "correct" it to a single `@`.
- Logger publishing triggers on `v*` tags (`standards-v*` tags deliberately do not match). The publish job runs: check-versions → build → smoke-test → validate → publish (npm) → publish-pypi → publish-cargo → mirror-to-github. The smoke test packs both tarballs, installs core from its tarball, and verifies the electron tarball contents before anything is published. Publish order is **core first, then electron** — electron's `workspace:*` dependency on core must resolve to a concrete version; the same ordering applies to the cargo crates.
- Cargo-registry gotchas: authenticated registries need a per-registry credential provider (`CARGO_REGISTRIES_NOCTURNA_CREDENTIAL_PROVIDER=cargo:token` — the `registry.credential-provider` key only covers crates.io), and rust-tauri's path dep on rust-cli names `registry = "nocturna"` so the published manifest resolves from the right index (root `.cargo/config.toml` defines it; local builds use the path and never touch the registry).
- `@nocturna/standards` is published **manually** after a standards release: `pnpm --filter @nocturna/standards publish --no-git-checks` (its `prepack` syncs `assets/` from `standards/agents/` + the doc). CI auto-publish for `standards-v*` tags is a deliberate follow-up, not an oversight.
- `mirror-to-github` is the last Publish step and only runs if publish succeeded: it force-pushes all branches and tags to the GitHub mirror `rebeccaatwaxeye/coding-standards` (OneDev is the source of truth; the mirror is write-only from CI). It needs a OneDev secret `github-mirror-token` holding a GitHub PAT with write access to that repo. The URL keeps OneDev's double-@ escaping — do not unescape it. The mirror is also what `standards/agents/bootstrap.sh` downloads tarballs from (it is public).
- The mirrored tag push triggers `.github/workflows/publish.yml` on GitHub, which builds the npm tarballs plus the Python sdist/wheel and attaches them to a GitHub Release. npm is NOT published to `npm.pkg.github.com` (GitHub Packages requires the scope to match the repo owner, so `@nocturna/*` is impossible there) — release assets are the npm distribution on GitHub; Rust/PHP stay git-tag-only.
- Bump `version` in **both** logger `package.json`s together (or use `scripts/release.sh`, which does it atomically) — the `check-versions` step fails the Publish job on mismatch.
- v0.1.0 was tagged before the CI fixes above and never published; v0.1.1 is the first proven release. Notable changes go in `CHANGELOG.md`.

## Architecture: The Logger

### Core data flow (`logger/node/`)

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
- Dependency direction is **one-way** in every host pair: core (`logger/node/`) must never import Electron; `logger/electron/` depends on core via `workspace:*`; `logger/rust-tauri/` depends on `logger/rust-cli` via path (tauri is default-features=false, so no webkit system libs are needed to build/test).

### Electron data flow (`logger/electron/`)

```
renderer: createRendererLogger(module)
  → window.__nocturnaLog()   (exposed by preload via contextBridge)
  → ipcRenderer.send('@nocturna/logger/log', payload)
  → main: createIpcLogHandler(factory)   (caches one logger per renderer module)
  → shared sinks (console + electronFileSink) — main and renderer logs land in one file
```

- The preload bridge falls back to plain `console[level]` in the renderer if the bridge isn't loaded yet.
- The IPC channel name lives in **one place**: `src/ipc-channel.ts`, imported by both `preload.ts` and `ipc-handler.ts` (which are separate build entries and cannot import each other). `ipc-handler.ts` re-exports it to preserve the public import path.
- `formatMessage()` and `normaliseError()` are exported from core (`logger/node/src/message.ts`) and reused by the Electron renderer — don't re-implement message coercion locally.
- `electronFileSink` wraps core `fileSink` with default dir `app.getPath('userData')/logs` and **7-day** retention (core default is 14 days).
- `installGlobalHandlers` logs CRITICAL then exits(1) after a 200ms `setTimeout` to let sinks flush.
- `createIpcLogHandler` takes a **factory**, not a logger, so each renderer module keeps its own module name.

### Shipped configs (`logger/node/configs/`)

`eslint.flat.js` / `eslint.flat.d.ts` / `biome.json` are **products** exported via the `./configs` package export for consumer projects. The Biome fragment targets Biome 2.5 (`noConsole` with `allow: []`, banning all `console.*` — matching the ESLint twin's `'no-console': ['error', { allow: [] }]`).

This repo also dogfoods lint: each JS package root has a `biome.json` (schema 2.5.11, `preset: recommended` plus §14.4's `noEmptyBlockStatements` and `noUnusedVariables` as errors; single quotes, no semicolons, `lineWidth: 100` to match the codebase style). One deliberate divergence from the shipped fragment: the dev configs **omit the `noConsole` rule** because the logger legitimately uses `console.*` (console sink, renderer fallback) — the shipped ESLint snippet notes the same exception for "the logger package itself". `style/noNonNullAssertion` is also off; tests rely on `!` after setup where narrowing is impractical.

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
- Both logger packages enforce coverage thresholds on every test run (90% statements/functions/lines, 80% branches) — `pnpm --filter <pkg> test` fails below them because the test script runs `vitest run --coverage`. The standards npm package enforces the same thresholds.
- `src/configs.test.ts` pins the `@nocturna/logger/configs` export contract: if `configs/eslint.flat.js` changes, update this test and the hand-maintained `configs/eslint.flat.d.ts` together.
- Note the tsconfig asymmetry: `logger/node/tsconfig.json` excludes `**/*.test.ts` from typecheck, `logger/electron/tsconfig.json` does not — electron test files are typechecked.

## Non-Obvious Trivia

- `logger/node/cjs/`, `logger/node/esm/`, `logger/node/ts/` are empty, gitignored leftovers from an earlier build setup — ignore them; real output goes to `dist/` via tsup.
- `pnpm-workspace.yaml` sets `onlyBuiltDependencies: [esbuild]` and `ignoredBuiltDependencies: [electron]` — electron's postinstall (a large binary download) is deliberately skipped; dev work only needs its type declarations and the tests mock the `electron` module.
- `@biomejs/biome` is floored at `^2.5.11` and the configs use the 2.5 schema — keep the floor and schema version in sync when upgrading Biome. `@types/node` is aligned to ^20 (the CI runtime), not the latest.
- Repo history is short; feature commits use conventional-commit style (`feat(logger):`, `fix(ci):`, `feat(agents):`).
- `standards/npm/assets/` is generated (copied from `standards/agents/` + the doc by `scripts/sync-assets.mjs` at prepack/pretest) and gitignored — never edit it; the test suite syncs it itself, so direct `vitest` runs work.
