import type { KernelPack, SpiceAsync } from '@rybosome/tspice'
import { spiceClients } from '@rybosome/tspice'

import { resolveVitePublicUrl } from '../scene/resolveVitePublicUrl.js'

export type ViewerSpiceClientBundle = {
  spice: SpiceAsync

  /** Terminate the underlying worker + cleanup transports. */
  dispose: () => void
}

/**
 * Viewer entrypoint for initializing a worker-backed `SpiceAsync` client.
 */
export async function createSpiceClient(pack: KernelPack): Promise<ViewerSpiceClientBundle> {
  const staticWasmUrl = resolveVitePublicUrl('static/backend-wasm/dist/tspice_backend_wasm.wasm')
  const resolvedPack: KernelPack = { ...pack, baseUrl: resolveVitePublicUrl(pack.baseUrl ?? './') }

  const { spice, dispose: disposeAsync } = await spiceClients
    .caching({
      maxEntries: 10_000,

      // SPICE queries are deterministic for a given op+args, so LRU-only is
      // sufficient. (TimeStore quantization also keeps the key space sane.)
      ttlMs: null,
    })
    .withKernels(resolvedPack)
    .toWebWorker({ wasmUrl: staticWasmUrl })

  const dispose = (): void => {
    void disposeAsync().catch((err) => console.warn('Spice worker dispose failed', err))
  }

  return { spice, dispose }
}
