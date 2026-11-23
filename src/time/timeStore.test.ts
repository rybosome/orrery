import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_RESUME_RATE_DAY_SEC_PER_SEC,
  DEFAULT_RESUME_RATE_HOUR_SEC_PER_SEC,
  DEFAULT_RESUME_RATE_WEEK_SEC_PER_SEC,
} from './defaultPlaybackRate.js'
import { SOL_SCENE } from '../scenes/sol.js'
import { createTimeStore } from './timeStore.js'

describe('timeStore default resume rate', () => {
  let timeStore: ReturnType<typeof createTimeStore>
  beforeEach(() => {
    timeStore = createTimeStore(SOL_SCENE.time)
  })

  it('falls back to 1d/s when no default is provided', () => {
    timeStore.togglePlay(undefined)
    expect(timeStore.getState().rateSecPerSec).toBe(DEFAULT_RESUME_RATE_DAY_SEC_PER_SEC)
  })

  it('treats <= 0 (and non-finite) as invalid and falls back to 1d/s', () => {
    timeStore.togglePlay(0)
    expect(timeStore.getState().rateSecPerSec).toBe(DEFAULT_RESUME_RATE_DAY_SEC_PER_SEC)

    timeStore.pause()
    timeStore.togglePlay(-1)
    expect(timeStore.getState().rateSecPerSec).toBe(DEFAULT_RESUME_RATE_DAY_SEC_PER_SEC)

    timeStore.pause()
    timeStore.togglePlay(Number.POSITIVE_INFINITY)
    expect(timeStore.getState().rateSecPerSec).toBe(DEFAULT_RESUME_RATE_DAY_SEC_PER_SEC)
  })

  it('clamps tiny positive values up to 1h/s', () => {
    timeStore.togglePlay(1)
    expect(timeStore.getState().rateSecPerSec).toBe(DEFAULT_RESUME_RATE_HOUR_SEC_PER_SEC)
  })

  it('clamps absurdly large values down to 1w/s', () => {
    timeStore.togglePlay(DEFAULT_RESUME_RATE_WEEK_SEC_PER_SEC * 100)
    expect(timeStore.getState().rateSecPerSec).toBe(DEFAULT_RESUME_RATE_WEEK_SEC_PER_SEC)
  })

  it('reverse uses the resolved default rate with a negative sign', () => {
    timeStore.reverse(1)
    expect(timeStore.getState().rateSecPerSec).toBe(-DEFAULT_RESUME_RATE_HOUR_SEC_PER_SEC)
  })
})

describe('scene time bounds', () => {
  const coverage = { minEtSec: -4.8, maxEtSec: 5.8 }

  it('keeps endpoints exact for manual input, stepping, and playback', () => {
    const clock = createTimeStore({ ...SOL_SCENE.time, quantumSec: 1 })
    clock.initializeBounds(coverage)
    clock.setEtSec(-10)
    expect(clock.getState().etSec).toBe(-4.8)
    clock.setQuantumSec(4)
    expect(clock.getState().etSec).toBe(-4.8)
    clock.stepForward()
    expect(clock.getState().etSec).toBe(5.8)
    clock.advanceTime(-100)
    expect(clock.getState().etSec).toBe(-4.8)
    clock.advanceTime(100)
    expect(clock.getState().etSec).toBe(5.8)
  })

  it('intersects a restored snapshot window with hard coverage', () => {
    const clock = createTimeStore(SOL_SCENE.time)
    clock.initializeBounds(coverage)
    clock.restoreTime({ ...clock.getState(), scrubMinEtSec: -100, scrubMaxEtSec: 2.6, etSec: 10, quantumSec: 1 })
    expect(clock.getState()).toMatchObject({ scrubMinEtSec: -4.8, scrubMaxEtSec: 2.6, etSec: 2.6 })

    clock.restoreTime({ ...clock.getState(), scrubMinEtSec: 50, scrubMaxEtSec: 51, etSec: 50 })
    expect(clock.getState()).toMatchObject({ scrubMinEtSec: -4.8, scrubMaxEtSec: 5.8, etSec: 0 })
  })

  it('advances across sub-quantum ticks in either direction without sharing state', () => {
    const clock = createTimeStore({ ...SOL_SCENE.time, quantumSec: 1 })
    const otherClock = createTimeStore(SOL_SCENE.time)
    clock.initializeBounds(coverage)
    otherClock.initializeBounds(coverage)
    for (let tick = 0; tick < 60; tick++) clock.advanceTime(1 / 60)
    expect(clock.getState().etSec).toBe(1)
    expect(otherClock.getState().etSec).toBe(0)
    for (let tick = 0; tick < 120; tick++) clock.advanceTime(-1 / 60)
    expect(clock.getState().etSec).toBe(-1)
  })
})
