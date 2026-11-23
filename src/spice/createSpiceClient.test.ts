import { afterEach, describe, expect, it, vi } from 'vitest'

import { SOL_SCENE } from '../scenes/sol.js'
import { createSpiceClient } from './createSpiceClient.js'

const worker = vi.hoisted(() => {
  const toWebWorker = vi.fn().mockResolvedValue({ spice: {}, dispose: vi.fn().mockResolvedValue(undefined) })
  const withKernels = vi.fn().mockReturnValue({ toWebWorker })
  return { withKernels, toWebWorker }
})

vi.mock('@rybosome/tspice', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@rybosome/tspice')>()),
  spiceClients: { caching: () => ({ withKernels: worker.withKernels }) },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('createSpiceClient', () => {
  it('passes the ordered Sol pack and roots its assets at the deployment base on deep links', async () => {
    vi.stubEnv('BASE_URL', '/viewer/')
    vi.stubGlobal('window', { location: { href: 'https://orrery.test/viewer/sol/s/payload' } })

    const client = await createSpiceClient(SOL_SCENE.kernelPack)
    try {
      expect(worker.withKernels).toHaveBeenCalledExactlyOnceWith({
        baseUrl: 'https://orrery.test/viewer/',
        kernels: [
          { url: 'static/kernels/naif/lsk/naif0012.tls', path: 'naif/lsk/naif0012.tls' },
          { url: 'static/kernels/naif/pck/pck00011.tpc', path: 'naif/pck/pck00011.tpc' },
          { url: 'static/kernels/naif/spk/planets/de432s.bsp', path: 'naif/spk/planets/de432s.bsp' },
        ],
      })
      expect(worker.toWebWorker).toHaveBeenCalledExactlyOnceWith({
        wasmUrl: 'https://orrery.test/viewer/static/backend-wasm/dist/tspice_backend_wasm.wasm',
      })
    } finally {
      client.dispose()
    }
  })
})
