# Changelog

Notable changes to the `@nocturna/logger` packages and their release pipeline.

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

### Tooling

- CI: builds both packages before typechecking/testing (electron resolves
  core types through `dist/`), added a lint step.
- Publish job: version-parity check and a tarball smoke test (installs the
  packed core, verifies electron tarball contents) run before publishing.
- Tests added for the console, file, and JSON sinks, the four formatters,
  and the message helpers; coverage thresholds (90% statements/functions/
  lines, 80% branches) enforced on every test run.
- Per-package `biome.json` configs so lint runs deterministically.
- Root workspace scripts (`pnpm build` / `test` / `typecheck` / `lint`),
  `packageManager` pin, pre-commit lint hook, `.editorconfig`, and
  `scripts/release.sh` for one-command releases.

## 0.1.0

Tagged but never published — the publish pipeline was broken at this point.
Superseded by 0.1.1.
