import type { BootLoadingEventMap } from './bootLoadingTelemetry.js'
import type { LoadingEvent } from './loadingEvents.js'

/** Stable ordering used for deterministic aggregate readiness calculation. */
export const LOADING_READINESS_SUBSYSTEM_ORDER = [
  'spiceInit',
  'assetResolve',
  'deepLinkResolve',
  'converge',
] as const

/** Subsystems that contribute to aggregate loading readiness. */
export type LoadingReadinessSubsystemKey = (typeof LOADING_READINESS_SUBSYSTEM_ORDER)[number]

/** Lifecycle status for one readiness subsystem. */
export type LoadingReadinessSubsystemStatus = 'idle' | 'active' | 'ready' | 'failed'

/** Weight map used for aggregate loading readiness. */
export type LoadingReadinessWeights = Record<LoadingReadinessSubsystemKey, number>

/**
 * Default subsystem weights for aggregate readiness.
 *
 * Sum is normalized at compute time, so callers may override values without
 * requiring an exact `1.0` total.
 */
export const DEFAULT_LOADING_READINESS_WEIGHTS: LoadingReadinessWeights = {
  spiceInit: 0.3,
  assetResolve: 0.35,
  deepLinkResolve: 0.15,
  converge: 0.2,
}

/** Timing span recorded for one readiness subsystem. */
export interface LoadingReadinessTiming {
  startedAtRelativeMs: number | null
  completedAtRelativeMs: number | null
  durationMs: number | null
  reportedDurationMs: number | null
}

/** Readiness snapshot for one subsystem. */
export interface LoadingSubsystemReadiness {
  key: LoadingReadinessSubsystemKey
  label: string
  value: number
  weight: number
  status: LoadingReadinessSubsystemStatus
  timing: LoadingReadinessTiming
}

/** Telemetry-derived counters used to estimate startup asset readiness progress. */
export interface LoadingAssetReadinessProgress {
  expectedAssetCount: number | null
  startedLoadCount: number
  settledLoadCount: number
  failedLoadCount: number
}

/** Full loading readiness state tracked by the loading store. */
export interface LoadingReadinessState {
  value: number
  subsystems: Record<LoadingReadinessSubsystemKey, LoadingSubsystemReadiness>
  weights: LoadingReadinessWeights
  updatedAtRelativeMs: number | null
  assetProgress: LoadingAssetReadinessProgress
}

type ReadinessUpdateOptions = {
  atRelativeMs: number
  minValue?: number
  exactValue?: number
  allowDecreases?: boolean
  complete?: boolean
  failed?: boolean
  reportedDurationMs?: number | null
}

const SUBSYSTEM_LABELS: Record<LoadingReadinessSubsystemKey, string> = {
  spiceInit: 'SPICE init',
  assetResolve: 'Asset resolve',
  deepLinkResolve: 'Deep-link resolve',
  converge: 'Converge',
}

/** Create an initial readiness state with deterministic defaults. */
export function createLoadingReadinessState(options: { weights?: Partial<LoadingReadinessWeights> } = {}): LoadingReadinessState {
  const weights = resolveWeights(options.weights)

  const subsystems = LOADING_READINESS_SUBSYSTEM_ORDER.reduce<
    Record<LoadingReadinessSubsystemKey, LoadingSubsystemReadiness>
  >((acc, key) => {
    acc[key] = {
      key,
      label: SUBSYSTEM_LABELS[key],
      value: 0,
      weight: weights[key],
      status: 'idle',
      timing: {
        startedAtRelativeMs: null,
        completedAtRelativeMs: null,
        durationMs: null,
        reportedDurationMs: null,
      },
    }
    return acc
  }, {} as Record<LoadingReadinessSubsystemKey, LoadingSubsystemReadiness>)

  return {
    value: computeLoadingReadinessValue(subsystems, weights),
    subsystems,
    weights,
    updatedAtRelativeMs: null,
    assetProgress: {
      expectedAssetCount: null,
      startedLoadCount: 0,
      settledLoadCount: 0,
      failedLoadCount: 0,
    },
  }
}

/**
 * Compute deterministic aggregate readiness in `[0, 1]` from subsystem values
 * and configured weights.
 */
export function computeLoadingReadinessValue(
  subsystems: Record<LoadingReadinessSubsystemKey, Pick<LoadingSubsystemReadiness, 'value'>>,
  weights: LoadingReadinessWeights,
): number {
  let weightedTotal = 0
  let weightSum = 0

  for (const key of LOADING_READINESS_SUBSYSTEM_ORDER) {
    const weight = normalizeWeight(weights[key])
    weightedTotal += clamp01(subsystems[key].value) * weight
    weightSum += weight
  }

  if (weightSum <= 0) return 0
  return clamp01(weightedTotal / weightSum)
}

/**
 * Reduce readiness state from one boot telemetry event.
 *
 * The reducer is pure and mostly monotonic, with explicit down-adjustments only
 * for authoritative telemetry accounting (for example startup asset readiness
 * ratios that include failed required assets).
 */
export function reduceLoadingReadinessState(
  state: LoadingReadinessState,
  event: LoadingEvent<BootLoadingEventMap>,
): LoadingReadinessState {
  const atRelativeMs = sanitizeRelativeTimeMs(event.timestamp.relativeTimeMs)

  if (event.type === 'bootCompleted') {
    return finalizeLoadingReadinessState(state, atRelativeMs)
  }

  if (event.type === 'bootFailed') {
    return applySubsystemUpdate(state, 'converge', {
      atRelativeMs,
      minValue: 0.9,
      failed: true,
    })
  }

  if (event.type === 'sceneRuntimeInitStarted') {
    return applySubsystemUpdate(state, 'spiceInit', { atRelativeMs, minValue: 0.05 })
  }

  if (event.type === 'spiceClientInitStarted') {
    return applySubsystemUpdate(state, 'spiceInit', { atRelativeMs, minValue: 0.2 })
  }

  if (event.type === 'spiceKernelPackSelected') {
    return applySubsystemUpdate(state, 'spiceInit', { atRelativeMs, minValue: 0.4 })
  }

  if (event.type === 'spiceClientInitCompleted' || event.type === 'sceneSpiceClientLoaded') {
    return applySubsystemUpdate(state, 'spiceInit', { atRelativeMs, minValue: 0.75 })
  }

  if (event.type === 'sceneScrubRangeComputeStarted') {
    return applySubsystemUpdate(state, 'spiceInit', { atRelativeMs, minValue: 0.85 })
  }

  if (event.type === 'sceneScrubRangeComputeCompleted') {
    return applySubsystemUpdate(state, 'spiceInit', {
      atRelativeMs,
      exactValue: 1,
      complete: true,
    })
  }

  if (event.type === 'spiceClientInitFailed') {
    return applySubsystemUpdate(state, 'spiceInit', {
      atRelativeMs,
      minValue: 0.25,
      failed: true,
    })
  }

  if (event.type === 'sceneBodyAssetsInitStarted') {
    const metadata = event.metadata
    if (!metadata) {
      return applySubsystemUpdate(state, 'assetResolve', {
        atRelativeMs,
        minValue: 0.05,
      })
    }

    const nextAssetProgress: LoadingAssetReadinessProgress = {
      expectedAssetCount: sanitizeCount(metadata.startupAssetRequired),
      startedLoadCount: sanitizeCount(metadata.startupAssetCompleted + metadata.startupAssetPending),
      settledLoadCount: sanitizeCount(metadata.startupAssetCompleted + metadata.startupAssetFailed),
      failedLoadCount: sanitizeCount(metadata.startupAssetFailed),
    }

    const progressValue = Math.max(clamp01(metadata.startupAssetReadinessRatio), 0.05)

    return applySubsystemUpdate(state, 'assetResolve', {
      atRelativeMs,
      exactValue: progressValue,
      allowDecreases: true,
    }, nextAssetProgress)
  }

  if (event.type === 'textureLoadStarted') {
    const nextAssetProgress: LoadingAssetReadinessProgress = {
      ...state.assetProgress,
      startedLoadCount: state.assetProgress.startedLoadCount + 1,
    }

    return applySubsystemUpdate(
      state,
      'assetResolve',
      {
        atRelativeMs,
        minValue: Math.max(0.1, computeAssetReadinessRatio(nextAssetProgress)),
      },
      nextAssetProgress,
    )
  }

  if (event.type === 'textureLoadCompleted' || event.type === 'textureLoadFailed') {
    const settledLoadCount = state.assetProgress.settledLoadCount + 1
    const nextAssetProgress: LoadingAssetReadinessProgress = {
      ...state.assetProgress,
      settledLoadCount,
      failedLoadCount: state.assetProgress.failedLoadCount + (event.type === 'textureLoadFailed' ? 1 : 0),
    }

    return applySubsystemUpdate(
      state,
      'assetResolve',
      {
        atRelativeMs,
        minValue: Math.max(0.12, computeAssetReadinessRatio(nextAssetProgress)),
      },
      nextAssetProgress,
    )
  }

  if (
    event.type === 'bodyAssetsInitStarted' ||
    event.type === 'ringAssetsInitStarted' ||
    event.type === 'bodyAssetsInitCompleted' ||
    event.type === 'ringAssetsInitCompleted'
  ) {
    const minValue =
      event.type === 'bodyAssetsInitCompleted' || event.type === 'ringAssetsInitCompleted'
        ? 0.25
        : 0.08

    return applySubsystemUpdate(state, 'assetResolve', {
      atRelativeMs,
      minValue,
    })
  }

  if (event.type === 'sceneBodyAssetsInitCompleted') {
    const metadata = event.metadata
    if (!metadata) {
      return applySubsystemUpdate(state, 'assetResolve', {
        atRelativeMs,
        minValue: Math.max(0.25, state.subsystems.assetResolve.value),
        complete: true,
      })
    }

    const nextAssetProgress: LoadingAssetReadinessProgress = {
      expectedAssetCount: sanitizeCount(metadata.startupAssetRequired),
      startedLoadCount: sanitizeCount(metadata.startupAssetCompleted + metadata.startupAssetPending),
      settledLoadCount: sanitizeCount(metadata.startupAssetCompleted + metadata.startupAssetFailed),
      failedLoadCount: sanitizeCount(metadata.startupAssetFailed),
    }

    const ratio = clamp01(metadata.startupAssetReadinessRatio)

    return applySubsystemUpdate(
      state,
      'assetResolve',
      {
        atRelativeMs,
        exactValue: ratio,
        allowDecreases: true,
        complete: true,
      },
      nextAssetProgress,
    )
  }

  if (event.type === 'bootSnapshotLoadStarted') {
    return applySubsystemUpdate(state, 'deepLinkResolve', {
      atRelativeMs,
      minValue: 0.12,
    })
  }

  if (event.type === 'bootSnapshotParseStarted') {
    return applySubsystemUpdate(state, 'deepLinkResolve', {
      atRelativeMs,
      minValue: 0.3,
    })
  }

  if (event.type === 'bootSnapshotParseCompleted') {
    const metadata = event.metadata
    if (!metadata) {
      return applySubsystemUpdate(state, 'deepLinkResolve', {
        atRelativeMs,
        minValue: 0.5,
      })
    }

    const minValueByOutcome: Record<string, number> = {
      not_found: 0.75,
      valid: 0.65,
      invalid_payload: 0.75,
      failed: 0.4,
    }

    return applySubsystemUpdate(state, 'deepLinkResolve', {
      atRelativeMs,
      minValue: minValueByOutcome[metadata.outcome] ?? 0.5,
      reportedDurationMs: sanitizeDurationMs(metadata.durationMs),
    })
  }

  if (event.type === 'bootSnapshotParseFailed') {
    return applySubsystemUpdate(state, 'deepLinkResolve', {
      atRelativeMs,
      minValue: 0.45,
      failed: true,
    })
  }

  if (event.type === 'bootSnapshotApplyStarted') {
    return applySubsystemUpdate(state, 'deepLinkResolve', {
      atRelativeMs,
      minValue: 0.8,
    })
  }

  if (event.type === 'bootSnapshotApplyCompleted') {
    const metadata = event.metadata

    return applySubsystemUpdate(state, 'deepLinkResolve', {
      atRelativeMs,
      minValue: 0.95,
      reportedDurationMs: sanitizeDurationMs(metadata?.durationMs ?? 0),
    })
  }

  if (event.type === 'bootSnapshotApplyFailed') {
    const metadata = event.metadata

    return applySubsystemUpdate(state, 'deepLinkResolve', {
      atRelativeMs,
      minValue: 0.8,
      failed: true,
      reportedDurationMs: sanitizeDurationMs(metadata?.durationMs ?? 0),
    })
  }

  if (event.type === 'bootSnapshotLoadInvalid') {
    return applySubsystemUpdate(state, 'deepLinkResolve', {
      atRelativeMs,
      minValue: 0.92,
    })
  }

  if (event.type === 'bootSnapshotLoadCompleted') {
    const metadata = event.metadata

    return applySubsystemUpdate(state, 'deepLinkResolve', {
      atRelativeMs,
      exactValue: 1,
      complete: true,
      reportedDurationMs: sanitizeDurationMs(metadata?.durationMs ?? 0),
    })
  }

  if (event.type === 'sceneRuntimeReady') {
    return applySubsystemUpdate(state, 'converge', {
      atRelativeMs,
      minValue: 0.1,
    })
  }

  if (event.type === 'sceneInitialUpdateStarted') {
    return applySubsystemUpdate(state, 'converge', {
      atRelativeMs,
      minValue: 0.2,
    })
  }

  if (event.type === 'sceneInitialUpdateCompleted') {
    const metadata = event.metadata

    return applySubsystemUpdate(state, 'converge', {
      atRelativeMs,
      minValue: 0.4,
      reportedDurationMs: sanitizeDurationMs(metadata?.durationMs ?? 0),
    })
  }

  if (event.type === 'rendererFirstFrameRequested') {
    return applySubsystemUpdate(state, 'converge', {
      atRelativeMs,
      minValue: 0.55,
    })
  }

  if (event.type === 'rendererFirstFrameStarted') {
    return applySubsystemUpdate(state, 'converge', {
      atRelativeMs,
      minValue: 0.72,
    })
  }

  if (event.type === 'rendererFirstFrameCommitted') {
    return applySubsystemUpdate(state, 'converge', {
      atRelativeMs,
      minValue: 0.88,
    })
  }

  if (event.type === 'rendererFirstFrameCompleted') {
    return applySubsystemUpdate(state, 'converge', {
      atRelativeMs,
      exactValue: 1,
      complete: true,
    })
  }

  return state
}

/** Mark all readiness subsystems complete at value `1.0`. */
export function finalizeLoadingReadinessState(state: LoadingReadinessState, atRelativeMs: number): LoadingReadinessState {
  const nextSubsystems = LOADING_READINESS_SUBSYSTEM_ORDER.reduce<
    Record<LoadingReadinessSubsystemKey, LoadingSubsystemReadiness>
  >((acc, key) => {
    acc[key] = applySingleSubsystemUpdate(state.subsystems[key], {
      atRelativeMs,
      exactValue: 1,
      complete: true,
    })
    return acc
  }, {} as Record<LoadingReadinessSubsystemKey, LoadingSubsystemReadiness>)

  return {
    ...state,
    subsystems: nextSubsystems,
    value: computeLoadingReadinessValue(nextSubsystems, state.weights),
    updatedAtRelativeMs: atRelativeMs,
  }
}

function applySubsystemUpdate(
  state: LoadingReadinessState,
  key: LoadingReadinessSubsystemKey,
  options: ReadinessUpdateOptions,
  assetProgress: LoadingAssetReadinessProgress = state.assetProgress,
): LoadingReadinessState {
  const nextSubsystem = applySingleSubsystemUpdate(state.subsystems[key], options)

  const nextSubsystems = {
    ...state.subsystems,
    [key]: nextSubsystem,
  }

  return {
    ...state,
    subsystems: nextSubsystems,
    value: computeLoadingReadinessValue(nextSubsystems, state.weights),
    updatedAtRelativeMs: options.atRelativeMs,
    assetProgress,
  }
}

function applySingleSubsystemUpdate(
  subsystem: LoadingSubsystemReadiness,
  options: ReadinessUpdateOptions,
): LoadingSubsystemReadiness {
  const atRelativeMs = options.atRelativeMs
  const nextValue =
    options.exactValue != null
      ? options.allowDecreases
        ? clamp01(options.exactValue)
        : Math.max(subsystem.value, clamp01(options.exactValue))
      : Math.max(subsystem.value, clamp01(options.minValue ?? subsystem.value))

  const startedAtRelativeMs = subsystem.timing.startedAtRelativeMs ?? atRelativeMs

  const completedAtRelativeMs = options.complete
    ? Math.max(subsystem.timing.completedAtRelativeMs ?? atRelativeMs, atRelativeMs)
    : subsystem.timing.completedAtRelativeMs

  const durationMs =
    completedAtRelativeMs != null && startedAtRelativeMs != null
      ? Math.max(0, completedAtRelativeMs - startedAtRelativeMs)
      : subsystem.timing.durationMs

  const status: LoadingReadinessSubsystemStatus = options.complete
    ? 'ready'
    : options.failed
      ? 'failed'
      : subsystem.status === 'ready'
        ? 'ready'
        : 'active'

  return {
    ...subsystem,
    value: nextValue,
    status,
    timing: {
      startedAtRelativeMs,
      completedAtRelativeMs,
      durationMs,
      reportedDurationMs:
        options.reportedDurationMs == null ? subsystem.timing.reportedDurationMs : options.reportedDurationMs,
    },
  }
}

function resolveWeights(overrides?: Partial<LoadingReadinessWeights>): LoadingReadinessWeights {
  return {
    spiceInit: normalizeWeight(overrides?.spiceInit ?? DEFAULT_LOADING_READINESS_WEIGHTS.spiceInit),
    assetResolve: normalizeWeight(overrides?.assetResolve ?? DEFAULT_LOADING_READINESS_WEIGHTS.assetResolve),
    deepLinkResolve: normalizeWeight(overrides?.deepLinkResolve ?? DEFAULT_LOADING_READINESS_WEIGHTS.deepLinkResolve),
    converge: normalizeWeight(overrides?.converge ?? DEFAULT_LOADING_READINESS_WEIGHTS.converge),
  }
}

function normalizeWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 0
  return Math.max(0, weight)
}

function sanitizeRelativeTimeMs(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value)
}

function sanitizeDurationMs(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value)
}

function sanitizeCount(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function computeAssetReadinessRatio(progress: LoadingAssetReadinessProgress): number {
  const denominator =
    progress.expectedAssetCount != null && progress.expectedAssetCount > 0
      ? progress.expectedAssetCount
      : progress.startedLoadCount

  if (denominator <= 0) return 0

  return clamp01(progress.settledLoadCount / denominator)
}
