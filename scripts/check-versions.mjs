#!/usr/bin/env node
// Version-parity guard: every package in this repo must share one version.
// Run by the Publish job before anything is built or published.
import { readFileSync } from 'node:fs';

const json = (path) => JSON.parse(readFileSync(path, 'utf8')).version;
const toml = (path) => {
  const line = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('version'));
  if (line === undefined) throw new Error(`no version line in ${path}`);
  return line.split('=')[1].trim().replaceAll('"', '');
};

const packages = [
  ['@nocturna/logger', json('node/package.json')],
  ['@nocturna/logger-electron', json('electron/package.json')],
  ['nocturna-logger (rust-cli)', toml('rust-cli/Cargo.toml')],
  ['nocturna-logger-tauri (rust)', toml('rust-tauri/Cargo.toml')],
  ['nocturna-logger (python)', toml('python/pyproject.toml')],
  ['nocturna/logger (php)', json('php/composer.json')],
];

const expected = packages[0][1];
const mismatched = packages.filter(([, version]) => version !== expected);
if (mismatched.length > 0) {
  console.error(`version mismatch across packages (expected ${expected}):`);
  for (const [name, version] of packages) {
    console.error(`  ${name} = ${version}`);
  }
  process.exit(1);
}
console.log(`all package versions aligned: ${expected}`);
