# Nocturna Coding Standards & Logger

This repository contains two related deliverables:

1. **The Nocturna coding standards** — a canonical standards document plus
   installer packages that drop it into any repository.
2. **The reference implementation** of its structured-logging spec (§14) as six
   packages across four ecosystems.

## Repository Layout

```
├── standards/              Everything standards-related
│   ├── CODING_STANDARDS.md Canonical standards (source of truth, §-numbered)
│   ├── agents/             Agent-optimised distribution (core rules + language slices)
│   │   ├── install.sh      Bash installer — stamps files, generates .cursorrules
│   │   └── bootstrap.sh    Self-fetching installer (curl | bash, no clone needed)
│   ├── npm/                @nocturna/standards — npm installer package
│   └── cli/                nocturna-standards — cargo installer CLI
├── logger/
│   ├── node/               @nocturna/logger — zero-dependency core (Node + browser)
│   │   └── configs/        Shippable lint configs enforcing §14.4
│   ├── electron/           @nocturna/logger-electron — IPC bridge, file sink, global handlers
│   ├── rust-cli/           nocturna-logger (Rust) — core, byte-identical output
│   ├── rust-tauri/         nocturna-logger-tauri — Tauri app-data sink + IPC bridge
│   ├── python/             nocturna-logger (Python) — stdlib-only core
│   └── php/                nocturna/logger (PHP) — ext-json only
└── scripts/                release.sh, release-standards.sh, check-versions.mjs
```

All six logger packages share one version per release (checked by
`scripts/check-versions.mjs`) and produce byte-identical output — format parity
fixtures are asserted in every test suite. The standards version is an
independent line: it lives in the `standards/CODING_STANDARDS.md` header (the
single source of truth), and the installer packages derive their version from it.

## Installing the Standards

One command per ecosystem — **no clone of this repository needed**. All routes
install the same stamped files (`AGENTS.md`, `CODING_STANDARDS.md`,
`agents/rules/<lang>.md`, `agents/standards.json`, `.cursorrules`) and share one
drift-check format, so any tool's `status` agrees with any other tool's `install`.

**TypeScript / JavaScript** — one-time scope setup in `~/.npmrc`:

```
@nocturna:registry=https://nocturna.dev/coding-standards/~npm/
```

```bash
pnpm dlx @nocturna/standards install . typescript
# or pinned as a devDependency (standards updates arrive via pnpm update):
pnpm add -D @nocturna/standards && pnpm exec nocturna-standards install . typescript
```

**Rust** — from the private cargo registry (same `[registries.nocturna]` config
and token as the logger crates — see "Installing the Loggers"):

```bash
cargo install nocturna-standards --registry nocturna
nocturna-standards install . rust
```

Fallback without registry access: `cargo install --git https://nocturna.dev/coding-standards.git --tag standards-vX.Y.Z nocturna-standards`.

**Python / PHP / anything with bash** — self-fetching bootstrap:

```bash
curl -sSL https://raw.githubusercontent.com/rebeccaatwaxeye/coding-standards/main/standards/agents/bootstrap.sh | bash -s -- . python
```

**Updating:** `nocturna-standards status .` reports the installed version and any
drift (non-zero exit, CI-friendly); re-run `install` to refresh. Update the tool
itself first — `pnpm update @nocturna/standards`, a newer `--tag`, or `--ref` on
the bootstrap. Installed files are read-only snapshots: change the source here
and re-install, never edit the copies.

From a checkout, the bash installer works directly:

```bash
./standards/agents/install.sh ../my-api typescript
./standards/agents/install.sh ../my-api typescript python   # multiple languages
./standards/agents/install.sh ../my-api                     # all four
```

When standards change: edit `standards/CODING_STANDARDS.md` first (canonical — it
wins on any disagreement), mirror into `standards/agents/AGENTS.md` and the
relevant `standards/agents/rules/*.md` slice, then `./scripts/release-standards.sh`
syncs the package versions from the doc, runs the gates, and tags `standards-vX.Y.Z`.

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
pnpm build        # logger packages, core first (topological order)
pnpm test         # builds first, then tests with coverage gates
pnpm typecheck    # builds first, then tsc --noEmit
pnpm lint         # biome check in all JS packages
pnpm format
```

Other languages run in their directories:

```bash
(cd logger/rust-cli && cargo test && cargo clippy --all-targets -- -D warnings && cargo fmt --check)
(cd logger/rust-tauri && cargo test)
(cd standards/cli && cargo test)
(cd logger/python && python -m pytest --cov=nocturna_logger --cov-branch --cov-fail-under=90)
(cd logger/python && ruff check .)
(cd logger/php && composer install && vendor/bin/phpunit)
```

A pre-commit hook (husky) runs the lint gate before every commit.

Agents working in this repo should read [AGENTS.md](AGENTS.md).

## CI & Publishing

- **CI** (OneDev, `.onedev-buildspec.yml`) runs on every branch update as four
  parallel jobs: `ts` (lint → build → typecheck → test for the logger + standards
  packages), `rust` (fmt/clippy → test for the loggers + standards CLI), `python`
  (ruff → pytest, 90% gate), and `php` (PHPUnit).
- **Logger releases** trigger on `v*` tags (`./scripts/release.sh X.Y.Z`): version
  parity across all six packages (`scripts/check-versions.mjs`), build, smoke-test
  of the packed TS tarballs, then npm core **before** electron (electron's
  `workspace:*` dependency resolves to a concrete version). Rust/Python/PHP are
  intentionally not published to registries — they are consumed from this git
  repository (see below).
- **Standards releases** trigger on `standards-v*` tags (`./scripts/release-standards.sh`):
  versions derive from the `standards/CODING_STANDARDS.md` header, never from a
  command-line argument.
- After a successful logger publish, the job mirrors all branches and tags to the
  GitHub mirror (`github.com/rebeccaatwaxeye/coding-standards`). A GitHub Actions
  workflow there attaches the npm tarballs and the Python sdist/wheel to a GitHub
  Release for the tag — npm cannot go to GitHub Packages because its `@nocturna`
  scope must match the repo owner.
- Document notable changes in [CHANGELOG.md](CHANGELOG.md).

## Installing the Loggers (Internal)

All packages publish to private registries on the OneDev host; git tags remain as a
fallback (and as the only route for PHP). Version parity guarantees every release
carries all six packages at the same version.

**npm (TypeScript)** — configure the scope once in `~/.npmrc`:

```
@nocturna:registry=https://nocturna.dev/coding-standards/~npm/
```

```bash
pnpm add @nocturna/logger @nocturna/logger-electron
```

**PyPI (Python)** — the registry requires auth; use `__token__` with your OneDev
token (in the URL, `.netrc`, or keyring):

```bash
pip install nocturna-logger \
  --index-url https://__token__:<ONEDEV_TOKEN>@nocturna.dev/coding-standards/~pypi/simple/
```

**Cargo (Rust)** — define the registry and provide a token (the registry requires
auth for reads too):

```toml
# .cargo/config.toml (project or ~/.cargo)
[registries.nocturna]
index = "sparse+https://nocturna.dev/coding-standards/~cargo/"
```

```bash
export CARGO_REGISTRIES_NOCTURNA_TOKEN=<ONEDEV_TOKEN>
```

```toml
[dependencies]
nocturna-logger = { version = "0.1", registry = "nocturna" }
nocturna-logger-tauri = { version = "0.1", registry = "nocturna" }
```

**Composer (PHP)** — no Composer registry exists, so PHP installs from the git repo
as a VCS package:

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

### Fallback: git tags

Every release is also a `vX.Y.Z` tag on this repository, which carries all six
packages. Pin the tag matching the release you want:

**Rust** — the repo root is a Cargo workspace, so git dependencies can select the crate:

```toml
[dependencies]
nocturna-logger = { git = "https://nocturna.dev/coding-standards.git", tag = "vX.Y.Z", package = "nocturna-logger" }
nocturna-logger-tauri = { git = "https://nocturna.dev/coding-standards.git", tag = "vX.Y.Z", package = "nocturna-logger-tauri" }
```

**Python** — pip's subdirectory syntax points at `logger/python/` (tags up to
v0.1.7 use the old layout: `#subdirectory=python`):

```bash
pip install "nocturna-logger @ git+https://nocturna.dev/coding-standards.git@vX.Y.Z#subdirectory=logger/python"
```

Auth for git-based installs: use the same OneDev credentials you use for git
(composer/cargo/pip will prompt or read them from your git credential helper).

## License

MIT
