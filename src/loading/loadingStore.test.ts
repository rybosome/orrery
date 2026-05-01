import { describe, expect, it } from 'vitest'

import type { BootLoadingEventMap } from './bootLoadingTelemetry.js'
import type { LoadingEvent } from './loadingEvents.js'
import {
  createBootLoadingStoreSink,
  createInitialLoadingState,
  createLoadingStore,
  reduceLoadingState,
} from './loadingStore.js'

function bootEvent<TType extends Extract<keyof BootLoadingEventMap, string>>(
  type: TType,
  relativeTimeMs: number,
  ...metadata: BootLoadingEventMap[TType] extends undefined ? [] : [BootLoadingEventMap[TType]]
): LoadingEvent<BootLoadingEventMap> {
  const event = {
    type,
    timestamp: {
      absoluteTimeMs: 10_000 + relativeTimeMs,
      monotonicTimeMs: 2_000 + relativeTimeMs,
      relativeTimeMs,
    },
  } as {
    type: TType
    timestamp: {
      absoluteTimeMs: number
      monotonicTimeMs: number
      relativeTimeMs: number
    }
    metadata?: BootLoadingEventMap[TType]
  }

  if (metadata.length > 0) {
    event.metadata = metadata[0]
  }

  return event as LoadingEvent<BootLoadingEventMap>
}

describe('loadingStore', () => {
  it('progresses through ordered loading phases and never regresses', () => {
    const store = createLoadingStore()

    store.ingestBootTelemetryEvent(
      bootEvent('bootStarted', 0, {
        isE2e: false,
        enableLogDepth: false,
        animatedSky: true,
        twinkleEnabled: true,
      }),
    )
    expect(store.getState().phase).toBe('booting')

    store.ingestBootTelemetryEvent(bootEvent('sceneRuntimeInitStarted', 10))
    expect(store.getState().phase).toBe('spiceInit')

    store.ingestBootTelemetryEvent(
      bootEvent('sceneBodyAssetsInitStarted', 20, {
        bodyCount: 8,
        startupAssetTotal: 10,
        startupAssetRequired: 10,
        startupAssetCompleted: 0,
        startupAssetFailed: 0,
        startupAssetPending: 10,
        startupAssetReadinessRatio: 0,
      }),
    )
    expect(store.getState().phase).toBe('assetResolve')

    store.ingestBootTelemetryEvent(bootEvent('bootSnapshotLoadStarted', 30, { pathname: '/s/abc' }))
    expect(store.getState().phase).toBe('deepLinkResolve')

    store.ingestBootTelemetryEvent(bootEvent('rendererFirstFrameRequested', 40))
    expect(store.getState().phase).toBe('converge')

    store.ingestBootTelemetryEvent(bootEvent('bootCompleted', 50, { isE2e: false }))
    expect(store.getState().phase).toBe('ready')
    expect(store.getState().readiness.value).toBe(1)

    // Once `ready`, lower-rank events should not move the phase backward.
    store.ingestBootTelemetryEvent(bootEvent('spiceClientInitStarted', 60, { kernelCount: 3, wasmUrl: 'wasm' }))
    expect(store.getState().phase).toBe('ready')
  })

  it('captures boot failure metadata and completion timestamp', () => {
    let state = createInitialLoadingState()

    state = reduceLoadingState(state, {
      type: 'bootTelemetryEvent',
      event: bootEvent('sceneRuntimeInitStarted', 12),
    })

    state = reduceLoadingState(state, {
      type: 'bootTelemetryEvent',
      event: bootEvent('bootFailed', 90, {
        phase: 'sceneRuntimeInit',
        errorName: 'Error',
        errorMessage: 'boom',
      }),
    })

    expect(state.phase).toBe('spiceInit')
    expect(state.failure).toEqual({
      phase: 'sceneRuntimeInit',
      errorName: 'Error',
      errorMessage: 'boom',
    })
    expect(state.completedAtRelativeMs).toBe(90)
    expect(state.lastEventType).toBe('bootFailed')
  })

  it('forwards trace sink events into the loading store', () => {
    const store = createLoadingStore()
    const sink = createBootLoadingStoreSink(store)

    sink.emit(
      bootEvent('bootStarted', 1, {
        isE2e: true,
        enableLogDepth: false,
        animatedSky: false,
        twinkleEnabled: false,
      }),
    )

    sink.emit(bootEvent('rendererFirstFrameRequested', 2))

    const state = store.getState()
    expect(state.eventCount).toBe(2)
    expect(state.phase).toBe('converge')
  })

  it('resets store back to initial state', () => {
    const store = createLoadingStore()

    store.ingestBootTelemetryEvent(bootEvent('rendererFirstFrameRequested', 20))
    expect(store.getState().phase).toBe('converge')

    store.reset()

    const state = store.getState()
    expect(state.phase).toBe('booting')
    expect(state.eventCount).toBe(0)
    expect(state.failure).toBeNull()
    expect(state.readiness.value).toBe(0)
  })
})
