import { useSyncExternalStore } from 'react'
import type { SceneTimeDefinition } from '../scenes/sceneDefinition.js'
import { quantizeEt } from './quantizeEt.js'

/** External-store snapshot describing the current playback/scrub time state. */
export interface TimeState {
  /** Current ephemeris time in seconds past J2000 (quantized). */
  etSec: number
  /** Simulation rate: sim-seconds per wall-clock-second. Negative = reverse playback. */
  rateSecPerSec: number
  /** Time quantum for quantization (seconds). */
  quantumSec: number
  /** Step size for step forward/back (seconds). */
  stepSec: number
  /** Minimum ET for scrub slider. */
  scrubMinEtSec: number
  /** Maximum ET for scrub slider. */
  scrubMaxEtSec: number
}

type Listener = () => void

type TimeBounds = { minEtSec: number; maxEtSec: number }

/** Return the nearest tick in range, preserving the exact endpoints. */
export function quantizeBoundedEt(etSec: number, quantumSec: number, bounds: TimeBounds): number {
  const { minEtSec, maxEtSec } = bounds
  if (etSec <= minEtSec) return minEtSec
  if (etSec >= maxEtSec) return maxEtSec
  return Math.max(minEtSec, Math.min(maxEtSec, quantizeEt(etSec, quantumSec)))
}

/** Own time, playback, and hard coverage bounds for one viewer session. */
export function createTimeStore(config: SceneTimeDefinition) {
  let state: TimeState = {
    etSec: config.initialEtSec,
    rateSecPerSec: 0, // Paused by default
    quantumSec: config.quantumSec,
    stepSec: config.stepSec,
    scrubMinEtSec: config.initialEtSec,
    scrubMaxEtSec: config.initialEtSec,
  }

  let hardBounds: TimeBounds = { minEtSec: config.initialEtSec, maxEtSec: config.initialEtSec }
  let playbackEtSec = config.initialEtSec
  const { rateLadder, resumeRates } = config

  const listeners = new Set<Listener>()

  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  const setState = (next: Partial<TimeState>) => {
    state = { ...state, ...next }
    notify()
  }

  const getState = (): TimeState => state
  const getSnapshot = () => state
  const getServerSnapshot = () => state

  const subscribe = (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const scrubBounds = (): TimeBounds => ({ minEtSec: state.scrubMinEtSec, maxEtSec: state.scrubMaxEtSec })

  const setEtSec = (etSec: number) => {
    if (!Number.isFinite(etSec)) return
    const boundedEt = quantizeBoundedEt(etSec, state.quantumSec, scrubBounds())
    playbackEtSec = boundedEt
    if (boundedEt !== state.etSec) setState({ etSec: boundedEt })
  }

  const setRate = (rate: number) => {
    if (Number.isFinite(rate) && rate !== state.rateSecPerSec) setState({ rateSecPerSec: rate })
  }

  const setQuantumSec = (quantumSec: number) => {
    if (Number.isFinite(quantumSec) && quantumSec > 0 && quantumSec !== state.quantumSec) {
      const etSec = quantizeBoundedEt(state.etSec, quantumSec, scrubBounds())
      playbackEtSec = etSec
      setState({ quantumSec, etSec })
    }
  }

  const setStepSec = (stepSec: number) => {
    if (Number.isFinite(stepSec) && stepSec > 0 && stepSec !== state.stepSec) setState({ stepSec })
  }

  const initializeBounds = (bounds: TimeBounds, initialEtSec = config.initialEtSec) => {
    hardBounds = bounds
    const etSec = quantizeBoundedEt(initialEtSec, config.quantumSec, bounds)
    playbackEtSec = etSec
    setState({
      scrubMinEtSec: bounds.minEtSec,
      scrubMaxEtSec: bounds.maxEtSec,
      etSec,
      rateSecPerSec: 0,
      quantumSec: config.quantumSec,
      stepSec: config.stepSec,
    })
  }

  const restoreTime = (saved: TimeState) => {
    const minEtSec = Math.max(saved.scrubMinEtSec, hardBounds.minEtSec)
    const maxEtSec = Math.min(saved.scrubMaxEtSec, hardBounds.maxEtSec)
    const intersects = minEtSec < maxEtSec
    const bounds = intersects ? { minEtSec, maxEtSec } : hardBounds
    const etSec = quantizeBoundedEt(intersects ? saved.etSec : config.initialEtSec, saved.quantumSec, bounds)
    playbackEtSec = etSec
    setState({
      etSec,
      scrubMinEtSec: bounds.minEtSec,
      scrubMaxEtSec: bounds.maxEtSec,
      rateSecPerSec: saved.rateSecPerSec,
      quantumSec: saved.quantumSec,
      stepSec: saved.stepSec,
    })
  }

  const resolveDefaultResumeRateSecPerSec = (defaultRate?: number): number => {
    if (defaultRate == null || !Number.isFinite(defaultRate) || defaultRate <= 0) return resumeRates.wideSecPerSec
    const min = Math.min(resumeRates.closeSecPerSec, resumeRates.wideSecPerSec)
    return Math.max(min, Math.min(resumeRates.maxSecPerSec, defaultRate))
  }

  const play = (defaultResumeRateSecPerSec?: number) => {
    if (state.rateSecPerSec === 0) {
      setState({ rateSecPerSec: resolveDefaultResumeRateSecPerSec(defaultResumeRateSecPerSec) })
    }
  }

  const pause = () => {
    setState({ rateSecPerSec: 0 })
  }

  const togglePlay = (defaultResumeRateSecPerSec?: number) => {
    if (state.rateSecPerSec === 0) {
      play(defaultResumeRateSecPerSec)
    } else {
      pause()
    }
  }

  const stepBy = (deltaSec: number) => {
    setEtSec(state.etSec + deltaSec)
  }

  const stepForward = () => stepBy(state.stepSec)
  const stepBackward = () => stepBy(-state.stepSec)

  /**
   * Move to the next faster rate in the ladder.
   * If at the fastest forward rate, stays there.
   */
  const faster = () => {
    const currentIdx = findClosestRateIndex(state.rateSecPerSec, rateLadder)
    const nextIdx = Math.min(currentIdx + 1, rateLadder.length - 1)
    setRate(rateLadder[nextIdx])
  }

  /**
   * Move to the next slower rate in the ladder.
   * If at the slowest (most negative) rate, stays there.
   */
  const slower = () => {
    const currentIdx = findClosestRateIndex(state.rateSecPerSec, rateLadder)
    const nextIdx = Math.max(currentIdx - 1, 0)
    setRate(rateLadder[nextIdx])
  }

  /**
   * Toggle playback direction while maintaining approximate speed.
   * If paused, starts reverse using the provided default (fallback: -1 day/s).
   */
  const reverse = (defaultResumeRateSecPerSec?: number) => {
    if (state.rateSecPerSec === 0) {
      setState({ rateSecPerSec: -resolveDefaultResumeRateSecPerSec(defaultResumeRateSecPerSec) })
    } else {
      setState({ rateSecPerSec: -state.rateSecPerSec })
    }
  }

  /**
   * Set direction to forward if currently going backward.
   * If paused, starts forward using the provided default (fallback: 1 day/s).
   */
  const forward = (defaultResumeRateSecPerSec?: number) => {
    if (state.rateSecPerSec === 0) {
      setState({ rateSecPerSec: resolveDefaultResumeRateSecPerSec(defaultResumeRateSecPerSec) })
    } else if (state.rateSecPerSec < 0) {
      setState({ rateSecPerSec: -state.rateSecPerSec })
    }
  }

  /**
   * Advance time by a delta (used by the ticker).
   * This method quantizes the result.
   */
  const advanceTime = (deltaSec: number) => {
    if (!Number.isFinite(deltaSec)) return
    const { minEtSec, maxEtSec } = scrubBounds()
    playbackEtSec = Math.max(minEtSec, Math.min(maxEtSec, playbackEtSec + deltaSec))
    const etSec = quantizeBoundedEt(playbackEtSec, state.quantumSec, { minEtSec, maxEtSec })
    if (etSec !== state.etSec) setState({ etSec })
  }

  return {
    getState,
    getSnapshot,
    getServerSnapshot,
    subscribe,

    // Actions
    setEtSec,
    setRate,
    setQuantumSec,
    setStepSec,
    initializeBounds,
    restoreTime,
    play,
    pause,
    togglePlay,
    stepBy,
    stepForward,
    stepBackward,
    faster,
    slower,
    reverse,
    forward,
    advanceTime,
  }
}

/**
 * Find the index of the closest rate in the ladder.
 */
function findClosestRateIndex(rate: number, rateLadder: readonly number[]): number {
  let closestIdx = 0
  let closestDist = Math.abs(rate - rateLadder[0])

  for (let i = 1; i < rateLadder.length; i++) {
    const dist = Math.abs(rate - rateLadder[i])
    if (dist < closestDist) {
      closestDist = dist
      closestIdx = i
    }
  }
  return closestIdx
}

export type TimeStore = ReturnType<typeof createTimeStore>

/**
 * React hook to use the time store.
 * Re-renders when any state changes.
 */
export function useTimeStore(timeStore: TimeStore): TimeState {
  return useSyncExternalStore(timeStore.subscribe, timeStore.getSnapshot, timeStore.getServerSnapshot)
}

/**
 * React hook to subscribe to a specific slice of the time store.
 * Only re-renders when the selected value changes.
 */
export function useTimeStoreSelector<T>(timeStore: TimeStore, selector: (state: TimeState) => T): T {
  return useSyncExternalStore(
    timeStore.subscribe,
    () => selector(timeStore.getSnapshot()),
    () => selector(timeStore.getServerSnapshot()),
  )
}
