# Nocturna Coding Standards & Logger

This repository contains two related deliverables:

1. **The Nocturna coding standards** — a canonical standards document plus an
   agent-optimised distribution that can be installed into any repository.
2. **The reference implementation** of its structured-logging spec (§14) as two
   publishable npm packages.

## Repository Layout

```
├── CODING_STANDARDS.md     Canonical standards (source of truth, §-numbered)
├── agents/                 Agent-optimised standards distribution
│   ├── AGENTS.md           Core rules, installed into consumer repos
│   ├── rules/              Language slices: typescript, php, rust, python
│   └── install.sh          Installer — versioned, copies rules + generates .cursorrules
├── node/                   @nocturna/logger — zero-dependency core (Node + browser)
│   └── configs/            Shippable lint configs enforcing §14.4
├── electron/               @nocturna/logger-electron — IPC bridge, file sink, global handlers
├── rust-cli/               nocturna-logger (Rust) — core, byte-identical output
├── rust-tauri/             nocturna-logger-tauri — Tauri app-data sink + IPC bridge
├── python/                 nocturna-logger (Python) — stdlib-only core
└── php/                    nocturna/logger (PHP) — ext-json only
```

All six logger packages share one version per release (checked by `scripts/check-versions.mjs`)
and produce byte-identical output — format parity fixtures are asserted in every test suite.

## Standards

`CODING_STANDARDS.md` is canonical. The `agents/` tree mirrors it in a format
optimised for AI coding agents (imperative, lazy-loaded language slices). To
install into another repository:

```bash
./agents/install.sh ../my-api typescript
./agents/install.sh ../my-api typescript python   # multiple languages
./agents/install.sh ../my-api                     # all four
```

When standards change: edit `CODING_STANDARDS.md` first, then mirror the change
into `agents/AGENTS.md` and the relevant `agents/rules/*.md`.

## Logger Packages

| Package | Description |
|---|---|
| `@nocturna/logger` / `nocturna-logger` / `nocturna-logger` / `nocturna/logger` | Structured logger: levels, mandatory redaction, console/file/JSON sinks, daily rotation + retention. TypeScript is zero-dep; Rust uses chrono + regex + serde_json; Python and PHP are stdlib/ext-json only. |
| `@nocturna/logger-electron` | Electron extensions: `userData` file sink, renderer→main IPC bridge, per-module renderer loggers, global error handlers. |
| `nocturna-logger-tauri` | Tauri extensions: `app_data_dir()` file sink (7-day retention), webview→main IPC command, panic handler. |

```ts
import { createLogger, consoleSink, fileSink } from '@nocturna/logger'

const log = createLogger({
  module: 'worker',
  sinks: [consoleSink(), fileSink({ dir: './logs', retainDays: 14 })],
})

log.info('job started', { operation: 'processOrder' })
log.error('payment failed', { error: paymentErr, data: { orderId } })
```

Redaction is always on: keys matching `token`, `password`, `secret`,
`authorization`, `api[_-]?key`, and similar patterns become `[REDACTED]` before
any sink sees the entry.

## Development

Requires Node >= 18; pnpm is pinned via the root `packageManager` field (corepack handles it).

```bash
pnpm install
pnpm build        # both packages, core first (topological order)
pnpm test         # builds first, then tests with coverage gates
pnpm typecheck    # builds first, then tsc --noEmit in both packages
pnpm lint         # biome check in both packages
pnpm format
```

A pre-commit hook (husky) runs the lint gate before every commit.

Agents working in this repo should read [AGENTS.md](AGENTS.md).

## CI & Publishing

- **CI** (OneDev, `.onedev-buildspec.yml`) runs on every branch update:
  npm lint → build → typecheck → test, then Rust lint/test, Python lint/test (90% gate),
  and PHP PHPUnit for the reference implementations.
- **Publish** triggers on `v*` tags: checks version parity across **all six** packages
  (`scripts/check-versions.mjs`), builds, smoke-tests the packed TS tarballs, validates, then
  publishes npm core **before** electron (electron's `workspace:*` dependency resolves to a
  concrete version). Rust/Python/PHP publishing to crates.io/PyPI/Packagist is **intentionally
  not done** — all three stay internal and are consumed from this git repository (see below).
- To release: `./scripts/release.sh X.Y.Z` bumps **all six** packages, runs the release gate,
  commits, and tags. Then `git push origin main vX.Y.Z`.
- Packages publish to the private Nocturna registry (`nocturna.dev`).
- After a successful publish, the job mirrors all branches and tags to the GitHub mirror
  (`github.com/rebeccaatwaxeye/coding-standards`). A GitHub Actions workflow there attaches
  the npm tarballs and the Python sdist/wheel to a GitHub Release for the tag — npm cannot
  go to GitHub Packages because its `@nocturna` scope must match the repo owner.
- Document notable changes in [CHANGELOG.md](CHANGELOG.md).

## Installing the Loggers (Internal)

The npm packages come from the OneDev registry. The Rust, Python, and PHP packages have no
external registry — **git tags are the distribution mechanism**. Pin the tag that matches the
release you want (`vX.Y.Z`); version parity guarantees every tag carries all six packages.

**Rust** — the repo root is a Cargo workspace, so git dependencies can select the crate:

```toml
[dependencies]
nocturna-logger = { git = "https://nocturna.dev/coding-standards.git", tag = "vX.Y.Z", package = "nocturna-logger" }
nocturna-logger-tauri = { git = "https://nocturna.dev/coding-standards.git", tag = "vX.Y.Z", package = "nocturna-logger-tauri" }
```

**Python** — pip's subdirectory syntax points at `python/`:

```bash
pip install "nocturna-logger @ git+https://nocturna.dev/coding-standards.git@vX.Y.Z#subdirectory=python"
```

**PHP** — a root-level `composer.json` makes the repo resolvable as a Composer VCS package:

```json
{
    "repositories": [
        { "type": "vcs", "url": "https://nocturna.dev/coding-standards.git" }
    ],
    "require": {
        "nocturna/logger": "^X.Y.Z"
    }
}
```

Auth: use the same OneDev credentials you use for git (composer/cargo/pip will prompt or read
them from your git credential helper).

## License

MIT
