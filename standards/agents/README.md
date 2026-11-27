# Agent-Optimised Coding Standards

The same standards as `CODING_STANDARDS.md`, rewritten for AI coding agents.

## Why a separate version

The canonical document is written for humans: it explains rationale, keeps a
changelog, and uses prose to build understanding. That is valuable in review but
wasteful in a context window. Agents have different constraints:

| | Human version | Agent version |
|---|---|---|
| Rationale | Explains why, to build judgement | Omitted unless it changes the decision |
| Changelog | Tracks document history | Removed — agents don't need history |
| Language rules | All four inline | Split into slices, loaded on demand |
| Voice | Explanatory | Imperative |
| Size | ~470 lines, always | ~180 core + ~70–105 per language |

**Net effect:** an agent editing a Python file loads ~285 lines instead of ~470,
and never spends tokens on Rust rules.

## Layout

```
standards/agents/
├── AGENTS.md              Core universal rules — always loaded
├── rules/
│   ├── typescript.md      Loaded when editing .ts/.js/.svelte/.astro
│   ├── php.md             Loaded when editing .php
│   ├── rust.md            Loaded when editing .rs
│   └── python.md          Loaded when editing .py
├── install.sh             Bash installer — stamps files, generates .cursorrules
├── bootstrap.sh           Self-fetching installer (curl | bash, no clone needed)
└── README.md              This file
```

`AGENTS.md` holds only rules that apply in every language. Language rules live
in slices and are **not** repeated in the core — an agent reads the core first,
then lazy-loads the slice for the file it is editing.

## Install into a repository

Three routes, all producing byte-identical files (see "Versioning" below). No
clone of the coding-standards repo is required for any of them:

```bash
# npm (TypeScript/JavaScript projects) — needs the @nocturna scope in ~/.npmrc
pnpm dlx @nocturna/standards install . typescript

# cargo (Rust projects) — from the private registry (needs the [registries.nocturna]
# config + token documented in the repo README); --git is the fallback
cargo install nocturna-standards --registry nocturna
nocturna-standards install . rust

# bash (any project) — self-fetching bootstrap
curl -sSL https://raw.githubusercontent.com/rebeccaatwaxeye/coding-standards/main/standards/agents/bootstrap.sh | bash -s -- . python

# from a checkout of coding-standards
./standards/agents/install.sh ../my-api typescript
```

This installs:

| File | Purpose |
|---|---|
| `AGENTS.md` | Core rules at repo root, where agents look for it (stamped with the standards version) |
| `CODING_STANDARDS.md` | The full human-readable document, stamped (read-only snapshot) |
| `agents/rules/*.md` | The selected language slices |
| `agents/standards.json` | Manifest: standards version + installed languages |
| `.cursorrules` | Generated: core + selected slices concatenated |

## Versioning

The standards version lives in **one place**: the `**Version:**` header of
`CODING_STANDARDS.md`. The installers parse it at install time and stamp it into
the installed `AGENTS.md`, `CODING_STANDARDS.md`, and `agents/standards.json`.
The `@nocturna/standards` npm package and the `nocturna-standards` cargo crate
carry the same version (enforced by `scripts/check-versions.mjs` and a cargo
test that compares the crate version against the doc).

Check whether an installed repo is current (non-zero exit if not):

```bash
nocturna-standards status ../my-api        # or: ./standards/agents/install.sh --status ../my-api
# standards: v1.9.0 — UP TO DATE
#   typescript: OK
#   core AGENTS.md: OK
#   CODING_STANDARDS.md: OK
#   .cursorrules: OK
```

`status` detects three kinds of drift: a **stale version** (source doc is
newer), **modified files** (installed copies edited or partially updated), and
**missing files**. Fix all of them by re-running the install command it prints.
The exit code makes it CI-friendly:

```bash
nocturna-standards status . || echo "standards out of date — re-run the installer"
```

The standards version is independent of the logger package versions in
`logger/node/` and `logger/electron/`.

### Why `.cursorrules` is generated

Cursor reads a single file at the repo root and does not follow references to
other files. Installing core + slices as one concatenated file gives Cursor the
full ruleset, while `AGENTS.md` keeps the lazy-load structure for agents that
do follow references.

Generating it means it can never drift from `AGENTS.md`. Re-running the
installer updates it.

## Supported agents

| Agent | File it reads |
|---|---|
| Claude Code, Cline, Aider, Windsurf, Copilot | `AGENTS.md` |
| Cursor | `.cursorrules` (generated) |

`AGENTS.md` is the emerging cross-tool standard and is read by most modern
agents. `.cursorrules` covers Cursor, which predates that convention.

## Updating

1. Edit the canonical `CODING_STANDARDS.md` and bump its `**Version:**` header.
2. Mirror the change into `AGENTS.md` and the relevant `rules/*.md`.
3. Run `scripts/release-standards.sh` — it syncs the package versions from the
   doc, runs the gates, and tags `standards-vX.Y.Z`.
4. Consumers update the installer (`pnpm update`, newer `--tag`/`--ref`) and
   re-run `install` — or run `status` first to see the drift.

Both files describe the same rules. If they ever disagree, the canonical
`CODING_STANDARDS.md` wins — report the discrepancy.
