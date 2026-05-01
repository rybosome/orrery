import { describe, expect, it, vi } from 'vitest'

import type { BootLoadingEventMap } from '../loading/bootLoadingTelemetry.js'
import type { LoadingEvent } from '../loading/loadingEvents.js'
import { createLoadingTrace } from '../loading/loadingTrace.js'
import { createDefaultSceneSnapshotV1, type SceneSnapshotV1 } from './sceneSnapshot.js'
import { encodeSnapshot } from './sceneSnapshotCodec.js'
import { loadSnapshotFromPathnameAtBoot, parseSnapshotPayloadFromPathname } from './sceneSnapshotBoot.js'

const createCapturedBootTrace = () => {
  const events: LoadingEvent<BootLoadingEventMap>[] = []

  const trace = createLoadingTrace<BootLoadingEventMap>({
    sink: {
      emit: (event) => {
        events.push(event)
      },
    },
  })

  return { trace, events }
}

describe('sceneSnapshotBoot', () => {
  it('applies a valid `/s/<payload>` snapshot at boot', async () => {
    const snapshot = createDefaultSceneSnapshotV1()
    const snapshotToEncode: SceneSnapshotV1 = {
      ...snapshot,
      focusBody: 'MARS',
      player: {
        ...snapshot.player,
        etSec: 123_456,
        rateSecPerSec: 3_600,
        direction: 'forward',
        playing: true,
      },
      guides: {
        ...snapshot.guides,
        labelsEnabled: true,
      },
    }

    const payload = encodeSnapshot(snapshotToEncode)
    const applySnapshot = vi.fn(async (next: SceneSnapshotV1) => next)
    const { trace, events } = createCapturedBootTrace()

    const result = await loadSnapshotFromPathnameAtBoot({
      pathname: `/s/${payload}`,
      applySnapshot,
      trace,
    })

    expect(result.status).toBe('applied')
    expect(applySnapshot).toHaveBeenCalledTimes(1)

    const appliedArg = applySnapshot.mock.calls[0]?.[0]
    expect(appliedArg?.focusBody).toBe('MARS')
    expect(appliedArg?.player.etSec).toBe(123_456)
    expect(appliedArg?.guides.labelsEnabled).toBe(true)

    expect(events.map((event) => event.type)).toEqual([
      'bootSnapshotParseStarted',
      'bootSnapshotParseCompleted',
      'bootSnapshotApplyStarted',
      'bootSnapshotApplyCompleted',
    ])

    const parseCompleted = events.find((event) => event.type === 'bootSnapshotParseCompleted')
    expect(parseCompleted).toMatchObject({
      metadata: {
        outcome: 'valid',
        durationMs: expect.any(Number),
      },
    })

    const applyCompleted = events.find((event) => event.type === 'bootSnapshotApplyCompleted')
    expect(applyCompleted).toMatchObject({
      metadata: {
        durationMs: expect.any(Number),
      },
    })
  })

  it('falls back to defaults + raises invalid-payload notice callback for bad `/s/<payload>` links', async () => {
    const applySnapshot = vi.fn(async (next: SceneSnapshotV1) => next)
    const onInvalidPayload = vi.fn()
    const { trace, events } = createCapturedBootTrace()

    const result = await loadSnapshotFromPathnameAtBoot({
      pathname: '/s/@@@',
      applySnapshot,
      onInvalidPayload,
      trace,
    })

    expect(result.status).toBe('invalid_payload')
    expect(applySnapshot).not.toHaveBeenCalled()
    expect(onInvalidPayload).toHaveBeenCalledTimes(1)

    const invalidCall = onInvalidPayload.mock.calls[0]?.[0]
    expect(invalidCall?.errorCode).toBe('invalid_payload')
    expect(invalidCall?.errorMessage).toMatch(/invalid base64url/i)

    expect(events.map((event) => event.type)).toEqual([
      'bootSnapshotParseStarted',
      'bootSnapshotParseFailed',
      'bootSnapshotParseCompleted',
    ])

    const parseCompleted = events.find((event) => event.type === 'bootSnapshotParseCompleted')
    expect(parseCompleted).toMatchObject({
      metadata: {
        outcome: 'invalid_payload',
        durationMs: expect.any(Number),
      },
    })
  })

  it('emits apply failure boundaries when applySnapshot throws', async () => {
    const payload = encodeSnapshot(createDefaultSceneSnapshotV1())
    const applySnapshot = vi.fn(async () => {
      throw new Error('snapshot apply failed')
    })

    const { trace, events } = createCapturedBootTrace()

    await expect(
      loadSnapshotFromPathnameAtBoot({
        pathname: `/s/${payload}`,
        applySnapshot,
        trace,
      }),
    ).rejects.toThrow('snapshot apply failed')

    expect(events.map((event) => event.type)).toEqual([
      'bootSnapshotParseStarted',
      'bootSnapshotParseCompleted',
      'bootSnapshotApplyStarted',
      'bootSnapshotApplyFailed',
    ])

    const applyFailed = events.find((event) => event.type === 'bootSnapshotApplyFailed')
    expect(applyFailed).toMatchObject({
      metadata: {
        durationMs: expect.any(Number),
      },
    })
  })

  it('only parses the `/s/<payload>` path shape (not bare-root payloads)', () => {
    expect(parseSnapshotPayloadFromPathname('/s/abc123')).toBe('abc123')
    expect(parseSnapshotPayloadFromPathname('/abc123')).toBeNull()
    expect(parseSnapshotPayloadFromPathname('/s/abc/def')).toBeNull()
  })
})
