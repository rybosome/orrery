import { describe, expect, it } from 'vitest'

import { applySnapshot } from './sceneSnapshotAdapter.js'
import { createDefaultSceneSnapshotV1 } from './sceneSnapshot.js'

describe('sceneSnapshotAdapter.applySnapshot', () => {
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

    const applied = await applySnapshot(snapshot, {
      cancelFocusTween: () => calls.push('cancelFocusTween'),
      setSkipAutoZoomForFocusBody: () => calls.push('setSkipAutoZoomForFocusBody'),
      applyScale: () => calls.push('applyScale'),
      applyGuides: () => calls.push('applyGuides'),
      applyOrbitPaths: () => calls.push('applyOrbitPaths'),
      applySystem: () => calls.push('applySystem'),
      applyRendering: () => calls.push('applyRendering'),
      applyFocusBody: () => calls.push('applyFocusBody'),
      applyPlayer: () => calls.push('applyPlayer'),
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

    expect(applied.focusBody).toBe('JUPITER')
    expect(applied.player.etSec).toBe(42)
    expect(applied.player.direction).toBe('forward')
  })
})
