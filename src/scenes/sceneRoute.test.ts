import { describe, expect, it } from 'vitest'

import { V1_MARS_VIEW_PAYLOAD } from '../snapshot/fixtures/v1SolViews.js'
import { V2_SOL_MARS_VIEW_PAYLOAD } from '../snapshot/fixtures/v2SolViews.js'
import { decodeSnapshotDocument, encodeSnapshotDocument } from '../snapshot/sceneSnapshotCodec.js'
import { buildScenePath, resolveSceneRoute } from './sceneRoute.js'

describe('scene routes', () => {
  it('resolves the registered scene within the deployment base', () => {
    expect(buildScenePath('sol', '/viewer/')).toBe('/viewer/sol')
    expect(resolveSceneRoute('/viewer/', '/viewer/')).toMatchObject({ kind: 'scene', scene: { id: 'sol' } })
    expect(resolveSceneRoute('/viewer/sol', '/viewer/')).toMatchObject({ kind: 'scene', scene: { id: 'sol' } })
    expect(resolveSceneRoute('/viewer-other/sol', '/viewer/')).toMatchObject({ kind: 'unknown' })
    expect(resolveSceneRoute('/trappist-1', '/')).toMatchObject({ kind: 'unknown' })
  })

  it('restores both released v1 URL shapes and v2 with a scene-local focus ID', () => {
    for (const path of [
      `/${V1_MARS_VIEW_PAYLOAD}`,
      `/s/${V1_MARS_VIEW_PAYLOAD}`,
      `/sol/s/${V2_SOL_MARS_VIEW_PAYLOAD}`,
    ]) {
      expect(resolveSceneRoute('/viewer' + path, '/viewer/')).toMatchObject({
        kind: 'scene',
        scene: { id: 'sol' },
        snapshot: { focusBody: 'MARS', player: { etSec: 1_234_567 }, camera: { radius: 0.4 } },
      })
    }
    expect(resolveSceneRoute(`/${V2_SOL_MARS_VIEW_PAYLOAD}`, '/')).toMatchObject({ kind: 'unknown' })
  })

  it('uses the invalid-link fallback for explicit shares only', () => {
    for (const path of ['/s/', '/s/bad', '/sol/s', '/sol/s/bad/more', `/sol/s/${V1_MARS_VIEW_PAYLOAD}`]) {
      expect(resolveSceneRoute(path, '/')).toMatchObject({ kind: 'scene', invalidSnapshot: true })
    }
    expect(resolveSceneRoute('/bad', '/')).toMatchObject({ kind: 'unknown' })
  })

  it('rejects a v2 view naming a different scene, missing body, or invalid setting', () => {
    const decoded = decodeSnapshotDocument(V2_SOL_MARS_VIEW_PAYLOAD)
    if (!decoded.ok) throw new Error('Invalid v2 test fixture')
    const valid = decoded.document as object
    for (const overrides of [{ sceneId: 'trappist-1' }, { focusBodyId: 'NO_SUCH_BODY' }, { camera: { radius: -1 } }]) {
      const payload = encodeSnapshotDocument({ ...valid, ...overrides })
      expect(resolveSceneRoute(`/sol/s/${payload}`, '/')).toMatchObject({ kind: 'scene', invalidSnapshot: true })
    }
  })
})
