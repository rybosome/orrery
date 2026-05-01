import { describe, expect, it } from 'vitest'

import type { BootLoadingEventMap } from './bootLoadingTelemetry.js'
import type { LoadingEvent } from './loadingEvents.js'
import {
  computeLoadingReadinessValue,
  createLoadingReadinessState,
  finalizeLoadingReadinessState,
  reduceLoadingReadinessState,
  type LoadingReadinessSubsystemKey,
  type LoadingReadinessWeights,
} from './readinessModel.js'

function bootEvent<TType extends Extract<keyof BootLoadingEventMap, string>>(
  type: TType,
  relativeTimeMs: number,
  ...metadata: BootLoadingEventMap[TType] extends undefined ? [] : [BootLoadingEventMap[TType]]
): LoadingEvent<BootLoadingEventMap> {
  const event = {
    type,
    timestamp: {
      absoluteTimeMs: 10_000 + relativeTimeMs,
      monotonicTimeMs: 500 + relativeTimeMs,
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

function subsystemValues(
  values: Record<LoadingReadinessSubsystemKey, number>,
): Record<LoadingReadinessSubsystemKey, { value: number }> {
  return {
    spiceInit: { value: values.spiceInit },
    assetResolve: { value: values.assetResolve },
    deepLinkResolve: { value: values.deepLinkResolve },
    converge: { value: values.converge },
  }
}

describe('readinessModel', () => {
  it('computes deterministic weighted aggregate readiness in [0, 1]', () => {
    const weights: LoadingReadinessWeights = {
      spiceInit: 2,
      assetResolve: 1,
      deepLinkResolve: 1,
      converge: 0,
    }

    const value = computeLoadingReadinessValue(
      subsystemValues({
        spiceInit: 1.2,
        assetResolve: 0.5,
        deepLinkResolve: -0.25,
        converge: 0.9,
      }),
      weights,
    )

    expect(value).toBeCloseTo(0.625)
  })

  it('tracks spice subsystem timing span from start to completion', () => {
    let state = createLoadingReadinessState()

    state = reduceLoadingReadinessState(state, bootEvent('sceneRuntimeInitStarted', 10))
    state = reduceLoadingReadinessState(state, bootEvent('spiceClientInitStarted', 20, { kernelCount: 3, wasmUrl: 'wasm' }))
    state = reduceLoadingReadinessState(state, bootEvent('spiceKernelPackSelected', 30, { kernelCount: 3, kernelIds: ['a'] }))
    state = reduceLoadingReadinessState(state, bootEvent('sceneScrubRangeComputeCompleted', 80, { hasRange: true }))

    expect(state.subsystems.spiceInit.status).toBe('ready')
    expect(state.subsystems.spiceInit.value).toBe(1)
    expect(state.subsystems.spiceInit.timing.startedAtRelativeMs).toBe(10)
    expect(state.subsystems.spiceInit.timing.completedAtRelativeMs).toBe(80)
    expect(state.subsystems.spiceInit.timing.durationMs).toBe(70)
  })

  it('updates asset readiness from telemetry counters and accounting metadata', () => {
    let state = createLoadingReadinessState()

    state = reduceLoadingReadinessState(
      state,
      bootEvent('sceneBodyAssetsInitStarted', 100, {
        bodyCount: 8,
        startupAssetTotal: 10,
        startupAssetRequired: 10,
        startupAssetCompleted: 2,
        startupAssetFailed: 1,
        startupAssetPending: 7,
        startupAssetReadinessRatio: 0.2,
      }),
    )

    expect(state.assetProgress.expectedAssetCount).toBe(10)
    expect(state.assetProgress.startedLoadCount).toBe(9)
    expect(state.assetProgress.settledLoadCount).toBe(3)
    expect(state.subsystems.assetResolve.value).toBeCloseTo(0.2)

    state = reduceLoadingReadinessState(
      state,
      bootEvent('sceneBodyAssetsInitCompleted', 180, {
        bodyCount: 8,
        startupAssetTotal: 10,
        startupAssetRequired: 10,
        startupAssetCompleted: 9,
        startupAssetFailed: 1,
        startupAssetPending: 0,
        startupAssetReadinessRatio: 0.9,
      }),
    )

    expect(state.subsystems.assetResolve.status).toBe('ready')
    expect(state.subsystems.assetResolve.value).toBe(0.9)
    expect(state.subsystems.assetResolve.timing.startedAtRelativeMs).toBe(100)
    expect(state.subsystems.assetResolve.timing.completedAtRelativeMs).toBe(180)
    expect(state.subsystems.assetResolve.timing.durationMs).toBe(80)
  })

  it('captures deep-link timing with reported duration fields', () => {
    let state = createLoadingReadinessState()

    state = reduceLoadingReadinessState(state, bootEvent('bootSnapshotLoadStarted', 30, { pathname: '/s/abc' }))
    state = reduceLoadingReadinessState(
      state,
      bootEvent('bootSnapshotParseCompleted', 60, {
        pathname: '/s/abc',
        durationMs: 12,
        outcome: 'valid',
      }),
    )
    state = reduceLoadingReadinessState(
      state,
      bootEvent('bootSnapshotLoadCompleted', 90, {
        pathname: '/s/abc',
        durationMs: 35,
      }),
    )

    expect(state.subsystems.deepLinkResolve.status).toBe('ready')
    expect(state.subsystems.deepLinkResolve.timing.startedAtRelativeMs).toBe(30)
    expect(state.subsystems.deepLinkResolve.timing.completedAtRelativeMs).toBe(90)
    expect(state.subsystems.deepLinkResolve.timing.durationMs).toBe(60)
    expect(state.subsystems.deepLinkResolve.timing.reportedDurationMs).toBe(35)
  })

  it('finalizes all subsystems at full readiness', () => {
    let state = createLoadingReadinessState()

    state = reduceLoadingReadinessState(state, bootEvent('sceneRuntimeInitStarted', 10))
    state = finalizeLoadingReadinessState(state, 200)

    expect(state.value).toBe(1)

    for (const subsystem of Object.values(state.subsystems)) {
      expect(subsystem.status).toBe('ready')
      expect(subsystem.value).toBe(1)
      expect(subsystem.timing.startedAtRelativeMs).not.toBeNull()
      expect(subsystem.timing.completedAtRelativeMs).toBe(200)
    }
  })
})
