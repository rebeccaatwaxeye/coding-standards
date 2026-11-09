# Changelog

Notable changes to the `@nocturna/logger` packages and their release pipeline.

## 0.1.5

### Release pipeline

- The Publish job now mirrors the whole repository (all branches and tags,
  force-pushed) to the GitHub mirror `rebeccaatwaxeye/coding-standards` after
  the npm publish step succeeds; the mirror token lives in a OneDev secret
  (`github-mirror-token`).
- A GitHub Actions workflow (`.github/workflows/publish.yml`) on the mirror
  attaches the npm tarballs and the Python sdist/wheel to a GitHub Release
  for each `v*` tag. npm is not published to GitHub Packages (its scope must
  match the repo owner); Rust/PHP remain git-tag-only installs.

## 0.1.1

First release the pipeline can fully prove. v0.1.0 was tagged before the
publish pipeline worked and was never published.

### Packages

- `formatMessage()` and `normaliseError()` are now exported from
  `@nocturna/logger`; the Electron renderer bridge reuses them instead of
  duplicating the logic, so renderer error payloads gain `code` and
  record-input handling parity with core.
- Shipped Biome config fragment (`@nocturna/logger/configs`) migrated to the
  Biome 2.5 schema; the no-console rule now bans all console methods
  (`allow: []`), matching the ESLint twin.

### New reference implementations (§14.9)

- `nocturna-logger` (Rust crate, `rust-cli/`) — levels, thresholds, redaction,
  console/file/JSON sinks, `#[track_caller]` locations, panic hook. Deps:
  chrono, regex, serde_json.
- `nocturna-logger-tauri` (Rust crate, `rust-tauri/`) — `app_data_dir()` file
  sink (7-day retention), webview→main IPC command with per-module logger
  cache, re-exports the core.
- `nocturna-logger` (Python, `python/`) — stdlib-only; `create_logger`,
  `sys.excepthook`/`threading.excepthook` handlers, coverage gate at 90%.
- `nocturna/logger` (PHP, `php/`) — ext-json only; `LoggerFactory::create`,
  `$log(...)` invoke shorthand, exception/error/shutdown handlers.

All six packages share one version and produce byte-identical output —
format parity fixtures are asserted in every test suite.

### Tooling

- CI: builds both TS packages before typechecking/testing (electron resolves
  core types through `dist/`), added a lint step; Rust clippy/fmt/test,
  Python ruff/pytest, PHP PHPUnit steps for the new packages.
- Publish job: version-parity check across all six packages
  (`scripts/check-versions.mjs`) and a tarball smoke test (installs the
  packed core, verifies electron tarball contents) run before publishing.
- Tests added for the console, file, and JSON sinks, the four formatters,
  and the message helpers; coverage thresholds (90% statements/functions/
  lines, 80% branches) enforced on every TS/Python test run.
- Per-package `biome.json` configs so lint runs deterministically.
- Root workspace scripts (`pnpm build` / `test` / `typecheck` / `lint`),
  `packageManager` pin, pre-commit lint hook, `.editorconfig`, and
  `scripts/release.sh` for one-command releases (bumps all six packages).

## 0.1.0

Tagged but never published — the publish pipeline was broken at this point.
Superseded by 0.1.1.
