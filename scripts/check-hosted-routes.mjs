import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

import { V1_MARS_VIEW_PAYLOAD } from '../src/snapshot/fixtures/v1SolViews.ts'
import { V2_SOL_MARS_VIEW_PAYLOAD } from '../src/snapshot/fixtures/v2SolViews.ts'

const base = new URL(process.argv[2])
const builtShell = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
const entry = builtShell.match(/<script[^>]+src="([^"]+)"/)?.[1]
assert.ok(entry, 'The build should declare a hashed JavaScript entry point')

async function get(path) {
  const url = new URL(path, base)
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  assert.equal(response.status, 200, `${url.pathname} should be served directly`)
  return response
}

async function checkShell(path) {
  const response = await get(path)
  assert.match(response.headers.get('content-type') ?? '', /text\/html/i, `${path} should serve HTML`)
  assert.ok((await response.text()).includes(entry), `${path} should serve this deployment’s app shell`)
}

for (let attempt = 1; ; attempt++) {
  try {
    await checkShell('/')
    break
  } catch (error) {
    if (attempt === 12) throw error
    await delay(5_000)
  }
}

await Promise.all(
  [
    '/sol',
    `/${V1_MARS_VIEW_PAYLOAD}`,
    `/s/${V1_MARS_VIEW_PAYLOAD}`,
    `/sol/s/${V2_SOL_MARS_VIEW_PAYLOAD}`,
    '/sol/s/invalid',
    '/trappist-1',
  ].map(checkShell),
)

const bundle = await get(entry)
assert.match(bundle.headers.get('content-type') ?? '', /javascript/i)
await bundle.body.cancel()

const lsk = await get('/static/kernels/naif/lsk/naif0012.tls')
assert.match(await lsk.text(), /^KPL\/LSK/)

const wasm = new Uint8Array(await (await get('/static/backend-wasm/dist/tspice_backend_wasm.wasm')).arrayBuffer())
assert.deepEqual([...wasm.slice(0, 4)], [0, 97, 115, 109], 'The worker should receive WebAssembly bytes')

for (const path of ['/orrery-earth-lighting.png', '/static/textures/planets/earth.png']) {
  const asset = await get(path)
  assert.match(asset.headers.get('content-type') ?? '', /image\/png/i, `${path} should serve a PNG`)
  await asset.body.cancel()
}
console.log(`Verified hosted scene routes and assets at ${base.origin}`)
