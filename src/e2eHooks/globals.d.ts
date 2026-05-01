import type { Mat3ColMajor } from '@rybosome/tspice'

import type {
  CollectBootBaselineOptions,
  TspiceViewerBootBaselineSample,
  TspiceViewerBootDiagnosticsPayload,
} from './index.js'

declare global {
  interface Window {
    __tspice_viewer__e2e?: {
      getFrameTransform: (args: { from: string; to: string; et: number }) => Promise<Mat3ColMajor>

      /**
       * Apply a deterministic camera preset intended for visual regression tests.
       *
       * Current presets are intentionally minimal and focused on the Sun.
       */
      setCameraPreset?: (preset: 'sun-close' | 'sun-medium' | 'sun-far') => void

      /** Lock lighting values used by golden images (ambient + sun light intensity). */
      lockDeterministicLighting?: () => void

      /**
       * Render N frames (via `renderOnce()` + `requestAnimationFrame` stepping).
       *
       * Intended for flushing async texture uploads before screenshots.
       */
      renderNTimes?: (n: number) => Promise<void>

      /**
       * Render one frame and return basic perf counters.
       *
       * NOTE: this measures CPU time around a single `renderOnce()` call; it is
       * not a GPU timer query.
       */
      samplePerfCounters?: () => {
        cpuFrameMs: number
        drawCalls: number
        triangles: number
        textures: number
      }

      /** Return the last `samplePerfCounters()` result (or null if none). */
      getLastPerfCounters?: () => {
        cpuFrameMs: number
        drawCalls: number
        triangles: number
        textures: number
      } | null

      /** Read the latest structured boot diagnostics payload (if captured). */
      getBootDiagnostics?: () => TspiceViewerBootDiagnosticsPayload | null

      /** Capture a baseline sample tagged by profile + run type. */
      collectBootBaseline?: (options?: CollectBootBaselineOptions) => TspiceViewerBootBaselineSample | null

      /** Read all baseline samples captured in the current page session. */
      getCollectedBootBaselines?: () => TspiceViewerBootBaselineSample[]

      /** Clear in-memory baseline samples for the current page session. */
      clearCollectedBootBaselines?: () => void
    }

    /** Signals to Playwright tests that the WebGL scene has rendered at least once. */
    __tspice_viewer__rendered_scene?: boolean

    /** Number of in-flight async texture loads (e2e only). */
    __tspice_viewer__pending_texture_loads?: number

    /** Latest machine-readable boot diagnostics payload (e2e only). */
    __tspice_viewer__boot_diagnostics?: TspiceViewerBootDiagnosticsPayload | null

    /** In-memory diagnostics baseline capture samples (e2e only). */
    __tspice_viewer__boot_baselines?: TspiceViewerBootBaselineSample[]

    /** Monotonic run sequence id incremented once per viewer mount in e2e mode. */
    __tspice_viewer__boot_run_sequence?: number
  }
}

export {}
