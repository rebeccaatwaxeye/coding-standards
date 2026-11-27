#!/usr/bin/env bash
#
# Self-fetching installer for the Nocturna coding standards — no clone needed.
#
# Downloads the coding-standards repository tarball, runs standards/agents/install.sh
# from it, and cleans up. For machines that don't have (or don't want) a checkout.
#
# Usage:
#   ./bootstrap.sh <target-dir> [lang ...] [--ref <git-ref>]
#   curl -sSL https://raw.githubusercontent.com/rebeccaatwaxeye/coding-standards/main/standards/agents/bootstrap.sh | bash -s -- <target-dir> [lang ...]
#
# --ref selects the git ref to install from (default: main). Pin a standards
# release with a tag: --ref standards-v1.9.0
#
# NOCTURNA_STANDARDS_TARBALL overrides the tarball URL entirely (testing hook).

set -euo pipefail

REF="main"
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)
      REF="${2:?--ref requires a value}"
      shift 2
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ ${#ARGS[@]} -eq 0 ]]; then
  echo "Usage: bootstrap.sh <target-dir> [lang ...] [--ref <git-ref>]" >&2
  exit 1
fi

TARBALL_URL="${NOCTURNA_STANDARDS_TARBALL:-}"
if [[ -z "$TARBALL_URL" ]]; then
  case "$REF" in
    standards-v* | v*)
      TARBALL_URL="https://github.com/rebeccaatwaxeye/coding-standards/archive/refs/tags/$REF.tar.gz"
      ;;
    *)
      TARBALL_URL="https://github.com/rebeccaatwaxeye/coding-standards/archive/refs/heads/$REF.tar.gz"
      ;;
  esac
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Fetching coding-standards ($REF) ..."
curl -fsSL "$TARBALL_URL" | tar xz -C "$TMP"

SRC_DIR="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
if [[ -z "$SRC_DIR" || ! -f "$SRC_DIR/standards/agents/install.sh" ]]; then
  echo "Error: tarball did not contain standards/agents/install.sh" >&2
  exit 1
fi

exec bash "$SRC_DIR/standards/agents/install.sh" "${ARGS[@]}"
