#!/usr/bin/env bash
#
# Copy the canonical standards content into assets/ so this crate is
# self-contained for `cargo package` / `cargo publish` (include_str! cannot
# reach files outside the crate root). Assets are committed; the
# `assets_match_canonical_sources` test in src/lib.rs fails if they drift
# from the sources — re-run this script after editing standards/agents/ or
# standards/CODING_STANDARDS.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/.."

mkdir -p "$SCRIPT_DIR/assets/rules"
cp "$SRC/agents/AGENTS.md" "$SCRIPT_DIR/assets/AGENTS.md"
cp "$SRC/CODING_STANDARDS.md" "$SCRIPT_DIR/assets/CODING_STANDARDS.md"
cp "$SRC/agents/rules/"*.md "$SCRIPT_DIR/assets/rules/"

echo "assets synced from $SRC"
