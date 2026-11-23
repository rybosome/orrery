import { describe, expect, it } from 'vitest'

import { resolveSceneRoute } from '../scenes/sceneRoute.js'
import { createDefaultSceneSnapshotV1 } from './sceneSnapshot.js'
import {
  buildSceneSnapshotShareUrl,
  INITIAL_SNAPSHOT_SHARE_STATE,
  reduceSnapshotShareState,
} from './sceneSnapshotShare.js'

describe('sceneSnapshotShare', () => {
  it('generates a scene-bound v2 link under the deployment base', () => {
    const view = createDefaultSceneSnapshotV1()
    const shared = buildSceneSnapshotShareUrl(
      { ...view, v: 2, sceneId: 'sol', focusBodyId: 'MARS' },
      'https://orrery.test/viewer/?arrival=1#controls',
      '/viewer/',
    )
    const url = new URL(shared)
    expect(url.pathname).toMatch(/^\/viewer\/sol\/s\/[A-Za-z0-9_-]+$/)
    expect(url.search + url.hash).toBe('')
    expect(resolveSceneRoute(url.pathname, '/viewer/')).toMatchObject({
      kind: 'scene',
      scene: { id: 'sol' },
      snapshot: { focusBody: 'MARS', camera: view.camera, player: view.player },
    })
  })

  it('resets copy state to idle whenever a new URL is generated', () => {
    const next = reduceSnapshotShareState(
      {
        generatedUrl: 'https://orrery.test/old',
        copyStatus: 'copied',
      },
      { type: 'generated', url: 'https://orrery.test/new' },
    )

    expect(next.generatedUrl).toBe('https://orrery.test/new')
    expect(next.copyStatus).toBe('idle')
  })

  it('updates copy status only after a URL exists', () => {
    const unchanged = reduceSnapshotShareState(INITIAL_SNAPSHOT_SHARE_STATE, {
      type: 'copy_result',
      copied: true,
      attemptedUrl: 'https://orrery.test/payload',
    })
    expect(unchanged).toEqual(INITIAL_SNAPSHOT_SHARE_STATE)

    const copied = reduceSnapshotShareState(
      {
        generatedUrl: 'https://orrery.test/payload',
        copyStatus: 'idle',
      },
      {
        type: 'copy_result',
        copied: true,
        attemptedUrl: 'https://orrery.test/payload',
      },
    )
    expect(copied.copyStatus).toBe('copied')

    const failed = reduceSnapshotShareState(copied, {
      type: 'copy_result',
      copied: false,
      attemptedUrl: 'https://orrery.test/payload',
    })
    expect(failed.copyStatus).toBe('copy_failed')
  })

  it('ignores stale copy result events for older generated URLs', () => {
    const current = {
      generatedUrl: 'https://orrery.test/new',
      copyStatus: 'idle' as const,
    }

    const unchanged = reduceSnapshotShareState(current, {
      type: 'copy_result',
      copied: true,
      attemptedUrl: 'https://orrery.test/old',
    })

    expect(unchanged).toEqual(current)
  })
})
