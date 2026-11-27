// Copies the canonical standards content into assets/ so the package is
// self-contained when packed. Run automatically by prepack/pretest.
import { cpSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sourceDir = fileURLToPath(new URL('../../', import.meta.url)) // standards/
const assetsDir = fileURLToPath(new URL('../assets/', import.meta.url))

export function syncAssets() {
	mkdirSync(`${assetsDir}/rules`, { recursive: true })
	cpSync(`${sourceDir}/agents/AGENTS.md`, `${assetsDir}/AGENTS.md`)
	cpSync(`${sourceDir}/CODING_STANDARDS.md`, `${assetsDir}/CODING_STANDARDS.md`)
	cpSync(`${sourceDir}/agents/rules/`, `${assetsDir}/rules/`, { recursive: true })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	syncAssets()
	console.log(`assets synced from ${sourceDir}`)
}
