import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.join(repoRoot, 'node_modules', '@rybosome', 'tspice', 'backend-wasm', 'dist')
const targetDir = path.join(repoRoot, 'public', 'backend-wasm', 'dist')

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Missing source assets at ${sourceDir}. Run \`pnpm install\` first.`)
}

fs.rmSync(targetDir, { recursive: true, force: true })
fs.mkdirSync(path.dirname(targetDir), { recursive: true })
fs.cpSync(sourceDir, targetDir, { recursive: true })

const wasmFile = path.join(targetDir, 'tspice_backend_wasm.wasm')
if (!fs.existsSync(wasmFile)) {
  throw new Error(`Expected wasm file missing after sync: ${wasmFile}`)
}
