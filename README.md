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
│   └── install.sh          Installer — copies rules + generates .cursorrules
├── node/                   @nocturna/logger — zero-dependency core (Node + browser)
│   └── configs/            Shippable lint configs enforcing §14.4
└── electron/               @nocturna/logger-electron — IPC bridge, file sink, global handlers
```

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
| `@nocturna/logger` | Structured logger: levels, mandatory redaction, console/file/JSON sinks, daily rotation + retention. Zero runtime dependencies. |
| `@nocturna/logger-electron` | Electron extensions: `userData` file sink, renderer→main IPC bridge, per-module renderer loggers, global error handlers. |

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

Requires Node >= 18 and pnpm (via corepack or your version manager).

```bash
pnpm install --frozen-lockfile
pnpm --filter @nocturna/logger build          # build core first
pnpm --filter @nocturna/logger test
pnpm --filter @nocturna/logger typecheck
pnpm --filter @nocturna/logger lint           # same scripts in electron/
```

**The electron package resolves `@nocturna/logger` through core's `dist/`
output — always build core before typechecking or testing electron.**

Agents working in this repo should read [AGENTS.md](AGENTS.md).

## CI & Publishing

- **CI** (OneDev, `.onedev-buildspec.yml`) runs on every branch update:
  lint → build → typecheck → test for both packages.
- **Publish** triggers on `v*` tags: checks version parity between the two
  packages, builds, validates, then publishes core **before** electron
  (electron's `workspace:*` dependency resolves to a concrete version).
  Bump `version` in both `package.json`s together, then tag.

Packages publish to the private Nocturna registry (`nocturna.dev`).

## License

MIT
