import { useSyncExternalStore } from 'react'

import type { BootLoadingEventMap } from './bootLoadingTelemetry.js'
import type { LoadingEvent } from './loadingEvents.js'
import type { LoadingTraceSink } from './loadingTrace.js'
import {
  createLoadingReadinessState,
  reduceLoadingReadinessState,
  type LoadingReadinessState,
} from './readinessModel.js'

/** Ordered loading phases for startup orchestration. */
export const LOADING_PHASE_ORDER = [
  'booting',
  'spiceInit',
  'assetResolve',
  'deepLinkResolve',
  'converge',
  'ready',
] as const

/** Loading phase state machine nodes. */
export type LoadingPhase = (typeof LOADING_PHASE_ORDER)[number]

/** Failure metadata captured when startup emits `bootFailed`. */
export interface LoadingFailure {
  phase: string
  errorName: string
  errorMessage: string
}

/** Snapshot of startup loading state derived from boot telemetry. */
export interface LoadingState {
  phase: LoadingPhase
  readiness: LoadingReadinessState
  startedAtRelativeMs: number | null
  completedAtRelativeMs: number | null
  failure: LoadingFailure | null
  lastEventType: Extract<keyof BootLoadingEventMap, string> | null
  eventCount: number
}

/** Reducer events accepted by the loading store. */
export type LoadingStateEvent =
  | {
      type: 'reset'
    }
  | {
      type: 'bootTelemetryEvent'
      event: LoadingEvent<BootLoadingEventMap>
    }

/**
 * Create the initial loading-state snapshot.
 */
export function createInitialLoadingState(): LoadingState {
  return {
    phase: 'booting',
    readiness: createLoadingReadinessState(),
    startedAtRelativeMs: null,
    completedAtRelativeMs: null,
    failure: null,
    lastEventType: null,
    eventCount: 0,
  }
}

/**
 * Reduce loading state from store events.
 */
export function reduceLoadingState(state: LoadingState, event: LoadingStateEvent): LoadingState {
  if (event.type === 'reset') {
    return createInitialLoadingState()
  }

  const bootEvent = event.event
  const atRelativeMs = sanitizeRelativeTimeMs(bootEvent.timestamp.relativeTimeMs)
  const readiness = reduceLoadingReadinessState(state.readiness, bootEvent)

  const phaseFromTelemetry = resolveLoadingPhaseFromBootEvent(bootEvent)
  const nextPhase =
    phaseFromTelemetry == null ? state.phase : advanceLoadingPhase(state.phase, phaseFromTelemetry)

  const failure =
    bootEvent.type === 'bootFailed'
      ? {
          phase: bootEvent.metadata?.phase ?? 'unknown',
          errorName: bootEvent.metadata?.errorName ?? 'UnknownError',
          errorMessage: bootEvent.metadata?.errorMessage ?? 'Unknown error',
        }
      : state.failure

  const completedAtRelativeMs =
    bootEvent.type === 'bootCompleted'
      ? atRelativeMs
      : bootEvent.type === 'bootFailed'
        ? state.completedAtRelativeMs ?? atRelativeMs
        : state.completedAtRelativeMs

  return {
    phase: nextPhase,
    readiness,
    startedAtRelativeMs: state.startedAtRelativeMs ?? atRelativeMs,
    completedAtRelativeMs,
    failure,
    lastEventType: bootEvent.type,
    eventCount: state.eventCount + 1,
  }
}

type LoadingStoreListener = () => void

/**
 * Runtime loading store API.
 */
export interface LoadingStore {
  getState: () => LoadingState
  getSnapshot: () => LoadingState
  getServerSnapshot: () => LoadingState
  subscribe: (listener: LoadingStoreListener) => () => void
  dispatch: (event: LoadingStateEvent) => LoadingState
  ingestBootTelemetryEvent: (event: LoadingEvent<BootLoadingEventMap>) => LoadingState
  reset: () => LoadingState
}

/**
 * Create a lightweight external store for loading orchestration.
 */
export function createLoadingStore(initialState: LoadingState = createInitialLoadingState()): LoadingStore {
  let state = initialState
  const listeners = new Set<LoadingStoreListener>()

  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  const setState = (nextState: LoadingState) => {
    state = nextState
    notify()
  }

  const getState = () => state
  const getSnapshot = () => state
  const getServerSnapshot = () => state

  const subscribe = (listener: LoadingStoreListener): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const dispatch = (event: LoadingStateEvent): LoadingState => {
    const nextState = reduceLoadingState(state, event)
    if (nextState !== state) {
      setState(nextState)
    }
    return state
  }

  const ingestBootTelemetryEvent = (bootEvent: LoadingEvent<BootLoadingEventMap>): LoadingState => {
    return dispatch({ type: 'bootTelemetryEvent', event: bootEvent })
  }

  const reset = (): LoadingState => dispatch({ type: 'reset' })

  return {
    getState,
    getSnapshot,
    getServerSnapshot,
    subscribe,
    dispatch,
    ingestBootTelemetryEvent,
    reset,
  }
}

/** Shared singleton loading store used by `SceneCanvas` startup instrumentation. */
export const loadingStore = createLoadingStore()

/**
 * Create a trace sink that forwards boot telemetry into a loading store.
 */
export function createBootLoadingStoreSink(store: Pick<LoadingStore, 'ingestBootTelemetryEvent'> = loadingStore) {
  const sink: LoadingTraceSink<BootLoadingEventMap> = {
    emit: (event) => {
      store.ingestBootTelemetryEvent(event)
    },
  }

  return sink
}

/**
 * React hook that subscribes to the full loading-store snapshot.
 */
export function useLoadingStore(): LoadingState {
  return useSyncExternalStore(loadingStore.subscribe, loadingStore.getSnapshot, loadingStore.getServerSnapshot)
}

/**
 * React hook that subscribes to a selected loading-store slice.
 */
export function useLoadingStoreSelector<T>(selector: (state: LoadingState) => T): T {
  return useSyncExternalStore(
    loadingStore.subscribe,
    () => selector(loadingStore.getSnapshot()),
    () => selector(loadingStore.getServerSnapshot()),
  )
}

function resolveLoadingPhaseFromBootEvent(event: LoadingEvent<BootLoadingEventMap>): LoadingPhase | null {
  switch (event.type) {
    case 'bootStarted':
    case 'rendererRuntimeInitStarted':
    case 'rendererRuntimeInitCompleted':
      return 'booting'

    case 'sceneRuntimeInitStarted':
    case 'sceneRuntimeInitCompleted':
    case 'spiceClientInitStarted':
    case 'spiceKernelPackSelected':
    case 'spiceClientInitCompleted':
    case 'spiceClientInitFailed':
    case 'sceneSpiceClientLoaded':
    case 'sceneScrubRangeComputeStarted':
    case 'sceneScrubRangeComputeCompleted':
      return 'spiceInit'

    case 'sceneBodyAssetsInitStarted':
    case 'sceneBodyAssetsInitCompleted':
    case 'bodyAssetsInitStarted':
    case 'bodyAssetsInitCompleted':
    case 'ringAssetsInitStarted':
    case 'ringAssetsInitCompleted':
    case 'textureCacheLookup':
    case 'textureLoadStarted':
    case 'textureLoadCompleted':
    case 'textureLoadFailed':
      return 'assetResolve'

    case 'bootSnapshotLoadStarted':
    case 'bootSnapshotLoadCompleted':
    case 'bootSnapshotLoadInvalid':
    case 'bootSnapshotParseStarted':
    case 'bootSnapshotParseCompleted':
    case 'bootSnapshotParseFailed':
    case 'bootSnapshotApplyStarted':
    case 'bootSnapshotApplyCompleted':
    case 'bootSnapshotApplyFailed':
      return 'deepLinkResolve'

    case 'sceneRuntimeReady':
    case 'sceneInitialUpdateStarted':
    case 'sceneInitialUpdateCompleted':
    case 'rendererFirstFrameRequested':
    case 'rendererFirstFrameStarted':
    case 'rendererFirstFrameCommitted':
    case 'rendererFirstFrameCompleted':
      return 'converge'

    case 'bootCompleted':
      return 'ready'

    case 'bootFailed':
      return null

    default:
      return null
  }
}

function advanceLoadingPhase(current: LoadingPhase, next: LoadingPhase): LoadingPhase {
  const currentIndex = LOADING_PHASE_ORDER.indexOf(current)
  const nextIndex = LOADING_PHASE_ORDER.indexOf(next)
  if (nextIndex < currentIndex) return current
  return next
}

function sanitizeRelativeTimeMs(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value)
}
