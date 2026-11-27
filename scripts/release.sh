#!/usr/bin/env bash
#
# One-command release: bump all six packages, verify, commit, tag.
#
# Usage:
#   ./scripts/release.sh <semver>     e.g. ./scripts/release.sh 1.2.3
#
# What it does:
#   1. Requires a clean working tree
#   2. Sets `version` in node/ and electron/ package.json
#   3. Runs the release gate: lint, build, tests (with coverage)
#   4. Commits as `chore(release): vX.Y.Z` and creates annotated tag vX.Y.Z
#
# Then push manually: git push origin main vX.Y.Z
# (Pushing the tag triggers the OneDev Publish job.)

set -euo pipefail

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: $0 <semver>   e.g. $0 1.2.3" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree not clean — commit or stash first." >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null; then
  echo "Tag v$VERSION already exists." >&2
  exit 1
fi

echo "Bumping all six packages to $VERSION ..."
node -e "
const fs = require('fs');
const files = [
  'logger/node/package.json',
  'logger/electron/package.json',
  'logger/php/composer.json',
];
for (const p of files) {
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  json.version = '$VERSION';
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n');
}
for (const p of ['logger/rust-cli/Cargo.toml', 'logger/rust-tauri/Cargo.toml']) {
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(/^version = \"[^\"]+\"/m, 'version = \"$VERSION\"');
  fs.writeFileSync(p, s);
}
// rust-tauri's path dependency on rust-cli carries a version requirement for
// cargo publish — keep it in lockstep with the release version.
const tauriToml = 'logger/rust-tauri/Cargo.toml';
let tauri = fs.readFileSync(tauriToml, 'utf8');
tauri = tauri.replace(
  /(nocturna-logger = \{ path = \"\.\.\/rust-cli\", version = \")[^\"]+(\")/,
  (match, prefix, suffix) => prefix + '$VERSION' + suffix,
);
fs.writeFileSync(tauriToml, tauri);
const pyproj = 'logger/python/pyproject.toml';
let py = fs.readFileSync(pyproj, 'utf8');
py = py.replace(/^version = \"[^\"]+\"/m, 'version = \"$VERSION\"');
fs.writeFileSync(pyproj, py);
"

echo "Running release gate: lint, build, test ..."
pnpm -r run lint
pnpm -r run build
pnpm -r run test

git add logger/node/package.json logger/electron/package.json logger/rust-cli/Cargo.toml logger/rust-tauri/Cargo.toml logger/python/pyproject.toml logger/php/composer.json
git commit -m "chore(release): v$VERSION"
git tag -a "v$VERSION" -m "Release v$VERSION"

echo
echo "Released v$VERSION. Publish it with:"
echo "  git push origin main v$VERSION"
