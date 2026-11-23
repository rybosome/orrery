import { describe, expect, it } from 'vitest'

import { applySnapshotView } from './sceneSnapshotAdapter.js'
import { createDefaultSceneSnapshotV1 } from './sceneSnapshot.js'

describe('sceneSnapshotAdapter.applySnapshotView', () => {
  it('applies snapshot phases in deterministic order', async () => {
    const snapshot = {
      ...createDefaultSceneSnapshotV1(),
      focusBody: 'JUPITER',
      player: {
        ...createDefaultSceneSnapshotV1().player,
        etSec: 42,
        rateSecPerSec: 60,
        playing: true,
        direction: 'forward' as const,
      },
    }

    const calls: string[] = []

    await applySnapshotView(snapshot, {
      cancelFocusTween: () => calls.push('cancelFocusTween'),
      setSkipAutoZoomForFocusBody: () => calls.push('setSkipAutoZoomForFocusBody'),
      applyScale: () => calls.push('applyScale'),
      applyGuides: () => calls.push('applyGuides'),
      applyOrbitPaths: () => calls.push('applyOrbitPaths'),
      applySystem: () => calls.push('applySystem'),
      applyRendering: () => calls.push('applyRendering'),
      applyFocusBody: (body) => {
        expect(body).toBe('JUPITER')
        calls.push('applyFocusBody')
      },
      applyPlayer: (player) => {
        expect(player).toMatchObject({ etSec: 42, direction: 'forward' })
        calls.push('applyPlayer')
      },
      flushSceneUpdate: async () => {
        calls.push('flushSceneUpdate')
      },
      applyCamera: () => calls.push('applyCamera'),
    })

    expect(calls).toEqual([
      'cancelFocusTween',
      'setSkipAutoZoomForFocusBody',
      'applyScale',
      'applyGuides',
      'applyOrbitPaths',
      'applySystem',
      'applyRendering',
      'applyFocusBody',
      'applyPlayer',
      'flushSceneUpdate',
      'applyCamera',
    ])
  })
})
