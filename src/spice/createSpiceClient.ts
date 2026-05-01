import type { NaifKernelId, SpiceAsync } from '@rybosome/tspice'
import { kernels, spiceClients } from '@rybosome/tspice'

import { toLoadingTraceErrorMetadata, type BootLoadingTrace } from '../loading/bootLoadingTelemetry.js'

export type ViewerSpiceClientBundle = {
  spice: SpiceAsync

  /** Terminate the underlying worker + cleanup transports. */
  dispose: () => void
}

export type CreateSpiceClientOptions = {
  trace?: BootLoadingTrace
}

/**
 * Viewer entrypoint for initializing a worker-backed `SpiceAsync` client.
 */
export async function createSpiceClient(options: CreateSpiceClientOptions = {}): Promise<ViewerSpiceClientBundle> {
  const trace = options.trace

  const runtimeBaseUrl = new URL(import.meta.env.BASE_URL, window.location.href)
  const staticWasmUrl = new URL('static/backend-wasm/dist/tspice_backend_wasm.wasm', runtimeBaseUrl).toString()

  const NAIF_KERNEL_IDS = [
    'lsk/naif0012.tls',
    'pck/pck00011.tpc',
    'spk/planets/de432s.bsp',
  ] as const satisfies readonly [NaifKernelId, ...NaifKernelId[]]

  trace?.emit('spiceClientInitStarted', {
    kernelCount: NAIF_KERNEL_IDS.length,
    wasmUrl: staticWasmUrl,
  })
  trace?.emit('spiceKernelPackSelected', {
    kernelCount: NAIF_KERNEL_IDS.length,
    kernelIds: [...NAIF_KERNEL_IDS],
  })

  const pack = kernels
    .naif({
      origin: 'static/kernels/naif/',
      // Important for apps deployed under a subpath (GitHub Pages, etc).
      // Vite's BASE_URL is typically already directory-style (ends with '/').
      baseUrl: import.meta.env.BASE_URL,
      pathBase: 'naif/',
    })
    .pick(NAIF_KERNEL_IDS)

  try {
    const { spice, dispose: disposeAsync } = await spiceClients
      .caching({
        maxEntries: 10_000,

        // SPICE queries are deterministic for a given op+args, so LRU-only is
        // sufficient. (TimeStore quantization also keeps the key space sane.)
        ttlMs: null,
      })
      .withKernels(pack)
      .toWebWorker({ wasmUrl: staticWasmUrl })

    trace?.emit('spiceClientInitCompleted')

    const dispose = (): void => {
      trace?.emit('spiceClientDisposeStarted')

      void disposeAsync().catch((err) => {
        trace?.emit('spiceClientDisposeFailed', toLoadingTraceErrorMetadata(err))
        console.warn('Spice worker dispose failed', err)
      })
    }

    return { spice, dispose }
  } catch (err) {
    trace?.emit('spiceClientInitFailed', toLoadingTraceErrorMetadata(err))
    throw err
  }
}
