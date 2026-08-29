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
| Size | 459 lines, always | ~200 core + ~60 per language |

**Net effect:** an agent editing a Python file loads ~260 lines instead of 459,
and never spends tokens on Rust rules.

## Layout

```
agents/
├── AGENTS.md              Core universal rules — always loaded
├── rules/
│   ├── typescript.md      Loaded when editing .ts/.js/.svelte/.astro
│   ├── php.md             Loaded when editing .php
│   ├── rust.md            Loaded when editing .rs
│   └── python.md          Loaded when editing .py
├── install.sh             Installs into a repo, generates .cursorrules
└── README.md              This file
```

`AGENTS.md` holds only rules that apply in every language. Language rules live
in slices and are **not** repeated in the core — an agent reads the core first,
then lazy-loads the slice for the file it is editing.

## Install into a repository

```bash
# From a checkout of coding-standards
./agents/install.sh ../my-api typescript
./agents/install.sh ../my-api typescript python   # multiple languages
./agents/install.sh ../my-api                     # all four
```

This installs:

| File | Purpose |
|---|---|
| `AGENTS.md` | Core rules at repo root, where agents look for it |
| `agents/rules/*.md` | The selected language slices |
| `.cursorrules` | Generated: core + selected slices concatenated |

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

1. Edit the canonical `CODING_STANDARDS.md`.
2. Mirror the change into `AGENTS.md` and the relevant `rules/*.md`.
3. Re-run `install.sh` in each consuming repo.

Both files describe the same rules. If they ever disagree, the canonical
`CODING_STANDARDS.md` wins — report the discrepancy.
