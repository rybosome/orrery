import type { SpiceAsync } from '@rybosome/tspice'

import type { LoadingVisualPresetDiagnostics } from '../loading/convergence/index.js'
import { LOADING_PHASE_ORDER, type LoadingPhase, type LoadingState } from '../loading/loadingStore.js'
import {
  LOADING_READINESS_SUBSYSTEM_ORDER,
  type LoadingReadinessSubsystemKey,
  type LoadingReadinessSubsystemStatus,
  type LoadingReadinessTiming,
} from '../loading/readinessModel.js'

const BOOT_DIAGNOSTICS_SCHEMA_VERSION = 1 as const
const BOOT_BASELINE_SCHEMA_VERSION = 1 as const

type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

/** Boot lifecycle status encoded in e2e diagnostics snapshots. */
export type TspiceViewerBootDiagnosticsStatus = 'completed' | 'failed'

/** Baseline profile tags for machine-readable capture payloads. */
export type TspiceViewerBootBaselineProfile = 'desktop' | 'mobile'

/** Baseline run tags used to compare cold/warm startup behavior. */
export type TspiceViewerBootBaselineRunType = 'cold' | 'warm'

/**
 * Timing envelope for full-app boot diagnostics.
 */
export interface TspiceViewerBootDiagnosticsTiming {
  startedAtRelativeMs: number | null
  completedAtRelativeMs: number | null
  durationMs: number | null
}

/**
 * Readiness subsystem diagnostics snapshot.
 */
export interface TspiceViewerBootReadinessSubsystemDiagnostics {
  key: LoadingReadinessSubsystemKey
  status: LoadingReadinessSubsystemStatus
  value: number
  weight: number
  timing: LoadingReadinessTiming
}

/**
 * Machine-readable boot diagnostics payload exposed in e2e mode.
 */
export interface TspiceViewerBootDiagnosticsPayload {
  schemaVersion: typeof BOOT_DIAGNOSTICS_SCHEMA_VERSION
  runSequence: number
  status: TspiceViewerBootDiagnosticsStatus
  capturedAtEpochMs: number

  phase: {
    current: LoadingPhase
    order: ReadonlyArray<LoadingPhase>
  }

  overallTiming: TspiceViewerBootDiagnosticsTiming

  readiness: {
    aggregate: number
    updatedAtRelativeMs: number | null
    subsystems: TspiceViewerBootReadinessSubsystemDiagnostics[]
  }

  events: {
    count: number
    lastEventType: LoadingState['lastEventType']
  }

  failure: LoadingState['failure']

  metadata: {
    mode: 'e2e'
    isDev: boolean
    isCi: boolean
    pathname: string
    search: string
    userAgent: string
    viewport: {
      width: number
      height: number
      devicePixelRatio: number
    }
    loadingVisual: LoadingVisualPresetDiagnostics | null
  }
}

/**
 * Optional tags attached to a diagnostics baseline sample.
 */
export interface CollectBootBaselineOptions {
  profile?: TspiceViewerBootBaselineProfile
  runType?: TspiceViewerBootBaselineRunType
  scenario?: string
  tags?: readonly string[]
  metadata?: Record<string, JsonValue>
}

/**
 * Baseline sample payload for CI/dev parsing and cold/warm comparisons.
 */
export interface TspiceViewerBootBaselineSample {
  schemaVersion: typeof BOOT_BASELINE_SCHEMA_VERSION
  runSequence: number
  sampleIndex: number
  profile: TspiceViewerBootBaselineProfile
  runType: TspiceViewerBootBaselineRunType
  scenario: string | null
  tags: string[]
  collectedAtEpochMs: number
  diagnostics: TspiceViewerBootDiagnosticsPayload
  metadata?: Record<string, JsonValue>
}

/**
 * Install a small E2E-only API on `window` for Playwright tests.
 *
 * Returns an uninstall callback.
 */
export function installTspiceViewerE2eApi(args: { isE2e: boolean; spice: SpiceAsync }): () => void {
  if (!args.isE2e) return () => {}

  // Reset on each mount so tests don't accidentally pass due to a previous run.
  window.__tspice_viewer__rendered_scene = false
  window.__tspice_viewer__boot_diagnostics = null
  window.__tspice_viewer__boot_baselines = []

  const runSequence = (window.__tspice_viewer__boot_run_sequence ?? 0) + 1
  window.__tspice_viewer__boot_run_sequence = runSequence

  window.__tspice_viewer__e2e = {
    getFrameTransform: ({ from, to, et }) => args.spice.kit.frameTransform(from, to, et).then((m) => m.toColMajor()),

    getBootDiagnostics: () => {
      const payload = window.__tspice_viewer__boot_diagnostics
      return payload == null ? null : cloneJson(payload)
    },

    collectBootBaseline: (options) => collectBootBaselineSample({ runSequence, options }),

    getCollectedBootBaselines: () => {
      const samples = window.__tspice_viewer__boot_baselines ?? []
      return samples.map((sample) => cloneJson(sample))
    },

    clearCollectedBootBaselines: () => {
      window.__tspice_viewer__boot_baselines = []
    },
  }

  return () => {
    delete window.__tspice_viewer__e2e
    delete window.__tspice_viewer__rendered_scene
    delete window.__tspice_viewer__boot_diagnostics
    delete window.__tspice_viewer__boot_baselines
  }
}

/**
 * Capture and publish a machine-readable boot diagnostics payload (e2e only).
 */
export function captureTspiceViewerBootDiagnostics(args: {
  isE2e: boolean
  status: TspiceViewerBootDiagnosticsStatus
  loadingState: LoadingState
  loadingVisual?: LoadingVisualPresetDiagnostics
}): TspiceViewerBootDiagnosticsPayload | null {
  if (!args.isE2e) return null

  const runSequence = window.__tspice_viewer__boot_run_sequence ?? 1

  const startedAtRelativeMs = normalizeNullableNumber(args.loadingState.startedAtRelativeMs)
  const completedAtRelativeMs = normalizeNullableNumber(args.loadingState.completedAtRelativeMs)
  const durationMs =
    startedAtRelativeMs == null || completedAtRelativeMs == null
      ? null
      : Math.max(0, completedAtRelativeMs - startedAtRelativeMs)

  const readinessSubsystems = LOADING_READINESS_SUBSYSTEM_ORDER.map<TspiceViewerBootReadinessSubsystemDiagnostics>(
    (key) => {
      const subsystem = args.loadingState.readiness.subsystems[key]
      return {
        key,
        status: subsystem.status,
        value: normalizeNumber(subsystem.value),
        weight: normalizeNumber(subsystem.weight),
        timing: {
          startedAtRelativeMs: normalizeNullableNumber(subsystem.timing.startedAtRelativeMs),
          completedAtRelativeMs: normalizeNullableNumber(subsystem.timing.completedAtRelativeMs),
          durationMs: normalizeNullableNumber(subsystem.timing.durationMs),
          reportedDurationMs: normalizeNullableNumber(subsystem.timing.reportedDurationMs),
        },
      }
    },
  )

  const payload: TspiceViewerBootDiagnosticsPayload = {
    schemaVersion: BOOT_DIAGNOSTICS_SCHEMA_VERSION,
    runSequence,
    status: args.status,
    capturedAtEpochMs: Date.now(),

    phase: {
      current: args.loadingState.phase,
      order: [...LOADING_PHASE_ORDER],
    },

    overallTiming: {
      startedAtRelativeMs,
      completedAtRelativeMs,
      durationMs,
    },

    readiness: {
      aggregate: normalizeNumber(args.loadingState.readiness.value),
      updatedAtRelativeMs: normalizeNullableNumber(args.loadingState.readiness.updatedAtRelativeMs),
      subsystems: readinessSubsystems,
    },

    events: {
      count: Math.max(0, Math.floor(args.loadingState.eventCount)),
      lastEventType: args.loadingState.lastEventType,
    },

    failure: args.status === 'completed' ? null : args.loadingState.failure,

    metadata: {
      mode: 'e2e',
      isDev: import.meta.env.DEV,
      isCi: Boolean(import.meta.env.CI),
      pathname: window.location.pathname,
      search: window.location.search,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      loadingVisual: args.loadingVisual ? cloneJson(args.loadingVisual) : null,
    },
  }

  window.__tspice_viewer__boot_diagnostics = payload
  return cloneJson(payload)
}

/** Mark (via `window`) that the first render completed (E2E only). */
export function markTspiceViewerRenderedScene(args: { isE2e: boolean }) {
  if (!args.isE2e) return
  window.__tspice_viewer__rendered_scene = true
}

function collectBootBaselineSample(args: {
  runSequence: number
  options?: CollectBootBaselineOptions
}): TspiceViewerBootBaselineSample | null {
  const diagnostics = window.__tspice_viewer__boot_diagnostics
  if (diagnostics == null) return null

  const profile = args.options?.profile ?? inferBaselineProfileFromViewport()
  const runType = args.options?.runType ?? 'cold'
  const existingSamples = window.__tspice_viewer__boot_baselines ?? []
  const sampleIndex = existingSamples.length + 1

  const sample: TspiceViewerBootBaselineSample = {
    schemaVersion: BOOT_BASELINE_SCHEMA_VERSION,
    runSequence: args.runSequence,
    sampleIndex,
    profile,
    runType,
    scenario: args.options?.scenario ?? null,
    tags: [...(args.options?.tags ?? [])],
    collectedAtEpochMs: Date.now(),
    diagnostics: cloneJson(diagnostics),
    ...(args.options?.metadata ? { metadata: cloneJson(args.options.metadata) } : {}),
  }

  window.__tspice_viewer__boot_baselines = [...existingSamples, sample]
  return cloneJson(sample)
}

function inferBaselineProfileFromViewport(): TspiceViewerBootBaselineProfile {
  return window.innerWidth <= 768 ? 'mobile' : 'desktop'
}

function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value
}

function normalizeNullableNumber(value: number | null | undefined): number | null {
  if (value == null) return null
  return normalizeNumber(value)
}

function cloneJson<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value)) as T
}
