import {
  createLoadingTrace,
  createNoopLoadingTrace,
  type CreateLoadingTraceOptions,
  type LoadingTrace,
} from './loadingTrace.js'

export type BootTextureAssetKind =
  | 'surfaceMap'
  | 'normalMap'
  | 'roughnessMap'
  | 'ringMap'
  | 'earthNightLightsMap'
  | 'earthCloudsMap'
  | 'earthWaterMaskMap'

export type BootTextureEventMetadata = {
  bodyId?: string
  assetKind?: BootTextureAssetKind
}

export type LoadingTraceErrorMetadata = {
  errorName: string
  errorMessage: string
}

export type BootStartupAssetAccountingMetadata = {
  startupAssetTotal: number
  startupAssetRequired: number
  startupAssetCompleted: number
  startupAssetFailed: number
  startupAssetPending: number
  startupAssetReadinessRatio: number
}

export type BootSnapshotParseOutcome = 'not_found' | 'valid' | 'invalid_payload' | 'failed'

export type BootLoadingEventMap = {
  bootStarted: {
    isE2e: boolean
    enableLogDepth: boolean
    animatedSky: boolean
    twinkleEnabled: boolean
  }
  rendererRuntimeInitStarted: undefined
  rendererRuntimeInitCompleted: {
    durationMs: number
  }
  sceneRuntimeInitStarted: undefined
  sceneRuntimeInitCompleted: {
    durationMs: number
  }
  sceneInitialUpdateStarted: undefined
  sceneInitialUpdateCompleted: {
    durationMs: number
  }
  bootSnapshotLoadStarted: {
    pathname: string
  }
  bootSnapshotLoadCompleted: {
    pathname: string
    durationMs: number
  }
  bootSnapshotLoadInvalid: {
    pathname: string
    errorCode: string
    errorMessage: string
  }
  bootSnapshotParseStarted: {
    pathname: string
  }
  bootSnapshotParseCompleted: {
    pathname: string
    durationMs: number
    outcome: BootSnapshotParseOutcome
  }
  bootSnapshotParseFailed: {
    pathname: string
    payload?: string
    errorCode: string
    errorMessage: string
  }
  bootSnapshotApplyStarted: {
    pathname: string
    payload: string
  }
  bootSnapshotApplyCompleted: {
    pathname: string
    payload: string
    durationMs: number
  }
  bootSnapshotApplyFailed: {
    pathname: string
    payload: string
    durationMs: number
    errorName: string
    errorMessage: string
  }
  rendererFirstFrameRequested: undefined
  rendererFirstFrameStarted: {
    nowMs: number
  }
  rendererFirstFrameCommitted: {
    nowMs: number
  }
  rendererFirstFrameCompleted: {
    nowMs: number
  }
  bootCompleted: {
    isE2e: boolean
  }
  bootFailed: {
    phase: string
    errorName: string
    errorMessage: string
  }

  spiceClientInitStarted: {
    kernelCount: number
    wasmUrl: string
  }
  spiceKernelPackSelected: {
    kernelCount: number
    kernelIds: readonly string[]
  }
  spiceClientInitCompleted: undefined
  spiceClientInitFailed: LoadingTraceErrorMetadata
  spiceClientDisposeStarted: undefined
  spiceClientDisposeFailed: LoadingTraceErrorMetadata

  sceneSpiceClientLoaded: undefined
  sceneScrubRangeComputeStarted: undefined
  sceneScrubRangeComputeCompleted: {
    hasRange: boolean
  }
  sceneBodyAssetsInitStarted: {
    bodyCount: number
  } & BootStartupAssetAccountingMetadata
  sceneBodyAssetsInitCompleted: {
    bodyCount: number
  } & BootStartupAssetAccountingMetadata
  sceneRuntimeReady: {
    bodyCount: number
  }

  bodyAssetsInitStarted: {
    bodyId?: string
  }
  bodyAssetsInitCompleted: {
    bodyId?: string
  }
  ringAssetsInitStarted: {
    bodyId?: string
    hasTexture: boolean
  }
  ringAssetsInitCompleted: {
    bodyId?: string
    hasTexture: boolean
  }

  textureCacheLookup: BootTextureEventMetadata & {
    url: string
    resolvedUrl: string
    colorSpace: string
    cacheHit: boolean
  }
  textureLoadStarted: BootTextureEventMetadata & {
    url: string
    resolvedUrl: string
    colorSpace: string
    cacheHit: boolean
  }
  textureLoadCompleted: BootTextureEventMetadata & {
    url: string
    resolvedUrl: string
    colorSpace: string
    cacheHit: boolean
    durationMs: number
  }
  textureLoadFailed: BootTextureEventMetadata & {
    url: string
    resolvedUrl: string
    colorSpace: string
    cacheHit: boolean
    failureKind: 'loadError' | 'cacheCleared' | 'staleEntry'
    errorName: string
    errorMessage: string
  }
}

export type BootLoadingTrace = LoadingTrace<BootLoadingEventMap>

/**
 * Create a typed boot-loading trace.
 */
export function createBootLoadingTrace(
  options: CreateLoadingTraceOptions<BootLoadingEventMap> = {},
): BootLoadingTrace {
  return createLoadingTrace<BootLoadingEventMap>(options)
}

/**
 * Create a typed boot-loading trace with no configured sink.
 */
export function createNoopBootLoadingTrace(): BootLoadingTrace {
  return createNoopLoadingTrace<BootLoadingEventMap>()
}

/**
 * Convert an unknown thrown value into safe loading-trace error metadata.
 */
export function toLoadingTraceErrorMetadata(error: unknown): LoadingTraceErrorMetadata {
  if (error instanceof Error) {
    return {
      errorName: error.name || 'Error',
      errorMessage: error.message || 'Unknown error',
    }
  }

  if (typeof error === 'string') {
    return {
      errorName: 'Error',
      errorMessage: error,
    }
  }

  return {
    errorName: 'UnknownError',
    errorMessage: 'Unknown error',
  }
}
