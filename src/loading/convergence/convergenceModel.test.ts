import { describe, expect, it } from 'vitest'

import { createLoadingReadinessState } from '../readinessModel.js'
import { computeConvergencePrimitives, mapLoadingStateToConvergencePrimitives } from './convergenceModel.js'

describe('convergenceModel', () => {
  it('reduces overlay intensity as readiness converges', () => {
    const early = computeConvergencePrimitives({
      phase: 'spiceInit',
      readinessValue: 0.25,
      hasFailure: false,
    })

    const late = computeConvergencePrimitives({
      phase: 'converge',
      readinessValue: 0.9,
      hasFailure: false,
    })

    expect(late.overlayOpacity).toBeLessThan(early.overlayOpacity)
    expect(late.ringCompression).toBeLessThan(early.ringCompression)
    expect(late.pulseHz).toBeGreaterThan(early.pulseHz)
  })

  it('fades out and hides overlay at ready state', () => {
    const ready = computeConvergencePrimitives({
      phase: 'ready',
      readinessValue: 1,
      hasFailure: false,
    })

    expect(ready.overlayOpacity).toBe(0)
    expect(ready.showOverlay).toBe(false)
  })

  it('keeps overlay visible when startup fails', () => {
    const failed = computeConvergencePrimitives({
      phase: 'converge',
      readinessValue: 0.92,
      hasFailure: true,
    })

    expect(failed.showOverlay).toBe(true)
    expect(failed.overlayOpacity).toBeGreaterThan(0)
  })

  it('maps loading state snapshots directly', () => {
    const readiness = createLoadingReadinessState()
    readiness.value = 0.45

    const mapped = mapLoadingStateToConvergencePrimitives({
      phase: 'assetResolve',
      failure: null,
      readiness,
    })

    expect(mapped.phase).toBe('assetResolve')
    expect(mapped.readiness).toBeCloseTo(0.45)
    expect(mapped.showOverlay).toBe(true)
  })
})
