#!/usr/bin/env bash
#
# Standards release: sync the installer packages to the version declared in
# standards/CODING_STANDARDS.md (the single source of truth), verify, commit, tag.
#
# Usage:
#   ./scripts/release-standards.sh
#
# Before running: edit standards/CODING_STANDARDS.md (Version header + changelog)
# and mirror the change into standards/agents/ as needed. This script reads the
# version from the doc — it takes no version argument.
#
# After running: git push origin main standards-vX.Y.Z
# Then publish the npm package manually:
#   pnpm --filter @nocturna/standards publish --no-git-checks

set -euo pipefail

DOC="standards/CODING_STANDARDS.md"
VERSION="$(sed -n 's/^> \*\*Version:\*\* \([0-9][0-9A-Za-z.-]*\).*/\1/p' "$DOC" | head -n 1)"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Doc version '$VERSION' is not semver X.Y.Z — fix the header in $DOC." >&2
  exit 1
fi
TAG="standards-v$VERSION"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree not clean — commit or stash first." >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Tag $TAG already exists." >&2
  exit 1
fi

echo "Syncing installer packages to $VERSION (from $DOC) ..."
node -e "
const fs = require('fs');
const pkg = 'standards/npm/package.json';
const json = JSON.parse(fs.readFileSync(pkg, 'utf8'));
json.version = '$VERSION';
fs.writeFileSync(pkg, JSON.stringify(json, null, 2) + '\n');
const toml = 'standards/cli/Cargo.toml';
let s = fs.readFileSync(toml, 'utf8');
s = s.replace(/^version = \"[^\"]+\"/m, 'version = \"$VERSION\"');
fs.writeFileSync(toml, s);
"

echo "Syncing CLI assets ..."
standards/cli/sync-assets.sh

echo "Verifying version parity ..."
node scripts/check-versions.mjs

echo "Running gates: standards npm tests, cargo tests ..."
pnpm --filter @nocturna/standards test
cargo test -p nocturna-standards

git add standards/npm/package.json standards/cli/Cargo.toml standards/cli/assets Cargo.lock
if git diff --cached --quiet; then
  echo "Package manifests already at $VERSION — nothing to commit."
else
  git commit -m "chore(release): $TAG"
fi
git tag -a "$TAG" -m "Standards release v$VERSION"

echo
echo "Released $TAG. Publish it with:"
echo "  git push origin main $TAG"
echo "  pnpm --filter @nocturna/standards publish --no-git-checks"
echo "  (cd standards/cli && cargo publish --registry nocturna)"
