#!/usr/bin/env node
// Version guards, run by the Publish job before anything is built or published:
//   1. Logger parity — all six logger packages share one version.
//   2. Standards parity — the standards packages carry the version declared in
//      standards/CODING_STANDARDS.md (the single source of truth for it).
import { readFileSync } from 'node:fs';

const json = (path) => JSON.parse(readFileSync(path, 'utf8')).version;
const toml = (path) => {
  const line = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('version'));
  if (line === undefined) throw new Error(`no version line in ${path}`);
  return line.split('=')[1].trim().replaceAll('"', '');
};

const checkGroup = (label, packages) => {
  const expected = packages[0][1];
  const mismatched = packages.filter(([, version]) => version !== expected);
  if (mismatched.length > 0) {
    console.error(`version mismatch in ${label} (expected ${expected}):`);
    for (const [name, version] of packages) {
      console.error(`  ${name} = ${version}`);
    }
    process.exit(1);
  }
  console.log(`${label} aligned: ${expected}`);
};

checkGroup('logger packages', [
  ['@nocturna/logger', json('logger/node/package.json')],
  ['@nocturna/logger-electron', json('logger/electron/package.json')],
  ['nocturna-logger (rust-cli)', toml('logger/rust-cli/Cargo.toml')],
  ['nocturna-logger-tauri (rust)', toml('logger/rust-tauri/Cargo.toml')],
  ['nocturna-logger (python)', toml('logger/python/pyproject.toml')],
  ['nocturna/logger (php)', json('logger/php/composer.json')],
]);

const doc = readFileSync('standards/CODING_STANDARDS.md', 'utf8');
const docVersion = doc.match(/^> \*\*Version:\*\* (\S+)/m)?.[1];
if (docVersion === undefined) {
  console.error('could not parse version from standards/CODING_STANDARDS.md');
  process.exit(1);
}
checkGroup('standards packages (source: standards/CODING_STANDARDS.md)', [
  ['CODING_STANDARDS.md', docVersion],
  ['@nocturna/standards', json('standards/npm/package.json')],
  ['nocturna-standards (cli)', toml('standards/cli/Cargo.toml')],
]);
