import { describe, expect, it, vi } from 'vitest'

import { createDefaultSceneSnapshotV1, type SceneSnapshotV1 } from './sceneSnapshot.js'
import { encodeSnapshot } from './sceneSnapshotCodec.js'
import { loadSnapshotFromPathnameAtBoot, parseSnapshotPayloadFromPathname } from './sceneSnapshotBoot.js'

describe('sceneSnapshotBoot', () => {
  it('applies a valid canonical `/<payload>` snapshot at boot', async () => {
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

    const result = await loadSnapshotFromPathnameAtBoot({
      pathname: `/${payload}`,
      applySnapshot,
    })

    expect(result.status).toBe('applied')
    expect(applySnapshot).toHaveBeenCalledTimes(1)

    const appliedArg = applySnapshot.mock.calls[0]?.[0]
    expect(appliedArg?.focusBody).toBe('MARS')
    expect(appliedArg?.player.etSec).toBe(123_456)
    expect(appliedArg?.guides.labelsEnabled).toBe(true)
  })

  it('still applies valid legacy `/s/<payload>` snapshots during compatibility window', async () => {
    const snapshot = createDefaultSceneSnapshotV1()
    const snapshotToEncode: SceneSnapshotV1 = {
      ...snapshot,
      focusBody: 'VENUS',
      system: {
        ...snapshot.system,
        showRenderHud: true,
      },
    }

    const payload = encodeSnapshot(snapshotToEncode)
    const applySnapshot = vi.fn(async (next: SceneSnapshotV1) => next)

    const result = await loadSnapshotFromPathnameAtBoot({
      pathname: `/s/${payload}`,
      applySnapshot,
    })

    expect(result.status).toBe('applied')
    expect(applySnapshot).toHaveBeenCalledTimes(1)

    const appliedArg = applySnapshot.mock.calls[0]?.[0]
    expect(appliedArg?.focusBody).toBe('VENUS')
    expect(appliedArg?.system.showRenderHud).toBe(true)
  })

  it('falls back to defaults + raises invalid-payload notice callback for bad `/s/<payload>` links', async () => {
    const applySnapshot = vi.fn(async (next: SceneSnapshotV1) => next)
    const onInvalidPayload = vi.fn()

    const result = await loadSnapshotFromPathnameAtBoot({
      pathname: '/s/@@@',
      applySnapshot,
      onInvalidPayload,
    })

    expect(result.status).toBe('invalid_payload')
    expect(applySnapshot).not.toHaveBeenCalled()
    expect(onInvalidPayload).toHaveBeenCalledTimes(1)

    const invalidCall = onInvalidPayload.mock.calls[0]?.[0]
    expect(invalidCall?.errorCode).toBe('invalid_payload')
    expect(invalidCall?.errorMessage).toMatch(/invalid base64url/i)
  })

  it('parses canonical and legacy snapshot path shapes only', () => {
    expect(parseSnapshotPayloadFromPathname('/abc123')).toBe('abc123')
    expect(parseSnapshotPayloadFromPathname('/s/abc123')).toBe('abc123')

    expect(parseSnapshotPayloadFromPathname('/')).toBeNull()
    expect(parseSnapshotPayloadFromPathname('/s/abc/def')).toBeNull()
    expect(parseSnapshotPayloadFromPathname('/abc/def')).toBeNull()
    expect(parseSnapshotPayloadFromPathname('/static/textures/planets/earth.png')).toBeNull()
  })
})
