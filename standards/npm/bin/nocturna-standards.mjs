#!/usr/bin/env node
// nocturna-standards — install the Nocturna coding standards into a repository.
//
// Usage:
//   nocturna-standards install [dir] [lang ...]   (dir defaults to ., langs to all)
//   nocturna-standards status [dir]               (non-zero exit on drift)
import { fileURLToPath } from 'node:url'
import { install, LANGS, status, validateLangs } from '../lib/install.mjs'

const assetsDir = fileURLToPath(new URL('../assets/', import.meta.url))

const USAGE = `Usage:
  nocturna-standards install [dir] [lang ...]   install or update (dir defaults to .)
  nocturna-standards status [dir]               report installed version and drift

Languages: ${LANGS.join(', ')} (default: all)`

const [command, ...args] = process.argv.slice(2)

const fail = (message) => {
	console.error(message)
	process.exit(1)
}

try {
	switch (command) {
		case 'install': {
			const rest = [...args]
			const dir = rest.length > 0 && !LANGS.includes(rest[0]) ? rest.shift() : '.'
			const langs = rest.length > 0 ? rest : LANGS
			validateLangs(langs)
			for (const line of install(dir, langs, assetsDir)) console.log(line)
			console.log(`\nInstalled Nocturna coding standards into: ${dir}`)
			console.log('Commit AGENTS.md, agents/, .cursorrules, and CODING_STANDARDS.md.')
			break
		}
		case 'status': {
			const dir = args[0] ?? '.'
			const report = status(dir, assetsDir)
			for (const line of report.lines) console.log(line)
			if (!report.ok) process.exit(1)
			break
		}
		case '--help':
		case '-h':
		case undefined:
			console.log(USAGE)
			break
		default:
			console.error(`unknown command '${command}'\n\n${USAGE}`)
			process.exit(1)
	}
} catch (error) {
	fail(error instanceof Error ? error.message : String(error))
}
