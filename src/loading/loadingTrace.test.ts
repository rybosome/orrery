import { describe, expect, it } from 'vitest'

import type { LoadingEvent } from './loadingEvents.js'
import {
  createLoadingTimestampModel,
  createLoadingTrace,
  createNoopLoadingTrace,
  type LoadingTraceClock,
  type LoadingTraceSink,
} from './loadingTrace.js'

type TestLoadingEvents = {
  bootStart: undefined
  phaseComplete: {
    phase: string
    durationMs: number
  }
}

const createSequenceClock = (
  samples: Array<{ absoluteTimeMs: number; monotonicTimeMs: number }>,
): LoadingTraceClock => {
  let index = 0

  return {
    now: () => {
      const next = samples[Math.min(index, samples.length - 1)]
      index += 1
      return next
    },
  }
}

describe('createLoadingTrace', () => {
  it('uses monotonic timing for stable ordering and relative timestamps', () => {
    const clock = createSequenceClock([
      { absoluteTimeMs: 1000, monotonicTimeMs: 50 },
      { absoluteTimeMs: 1005, monotonicTimeMs: 55 },
      { absoluteTimeMs: 1012, monotonicTimeMs: 62 },
    ])

    const timestampModel = createLoadingTimestampModel({ clock })
    const trace = createLoadingTrace<TestLoadingEvents>({ timestampModel })

    const first = trace.emit('bootStart')
    const second = trace.emit('bootStart')

    expect(first.timestamp).toEqual({
      absoluteTimeMs: 1005,
      monotonicTimeMs: 55,
      relativeTimeMs: 5,
    })
    expect(second.timestamp).toEqual({
      absoluteTimeMs: 1012,
      monotonicTimeMs: 62,
      relativeTimeMs: 12,
    })
    expect(second.timestamp.relativeTimeMs).toBeGreaterThan(first.timestamp.relativeTimeMs)
  })

  it('forwards typed metadata payloads', () => {
    const clock = createSequenceClock([
      { absoluteTimeMs: 2000, monotonicTimeMs: 20 },
      { absoluteTimeMs: 2004, monotonicTimeMs: 24 },
    ])

    const timestampModel = createLoadingTimestampModel({ clock })
    const trace = createLoadingTrace<TestLoadingEvents>({ timestampModel })

    const event = trace.emit('phaseComplete', { phase: 'spiceInit', durationMs: 1750 })

    expect(event).toMatchObject({
      type: 'phaseComplete',
      metadata: { phase: 'spiceInit', durationMs: 1750 },
    })
  })

  it('invokes the configured sink for emitted events', () => {
    const clock = createSequenceClock([
      { absoluteTimeMs: 3000, monotonicTimeMs: 30 },
      { absoluteTimeMs: 3003, monotonicTimeMs: 33 },
    ])

    const received: LoadingEvent<TestLoadingEvents>[] = []
    const sink: LoadingTraceSink<TestLoadingEvents> = {
      emit: (event) => {
        received.push(event)
      },
    }

    const timestampModel = createLoadingTimestampModel({ clock })
    const trace = createLoadingTrace<TestLoadingEvents>({ sink, timestampModel })

    const emitted = trace.emit('phaseComplete', { phase: 'rendererReady', durationMs: 3 })

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual(emitted)
  })

  it('is safe to use as a no-op trace', () => {
    const trace = createNoopLoadingTrace<TestLoadingEvents>()

    expect(() => trace.emit('bootStart')).not.toThrow()

    const event = trace.emit('phaseComplete', { phase: 'ready', durationMs: 0 })

    expect(event.type).toBe('phaseComplete')
    expect(event.metadata).toEqual({ phase: 'ready', durationMs: 0 })
    expect(Number.isFinite(event.timestamp.absoluteTimeMs)).toBe(true)
    expect(Number.isFinite(event.timestamp.monotonicTimeMs)).toBe(true)
    expect(Number.isFinite(event.timestamp.relativeTimeMs)).toBe(true)
  })
})
