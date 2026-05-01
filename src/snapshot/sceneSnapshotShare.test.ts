import { describe, expect, it } from 'vitest'

import { parseSnapshotPayloadFromPathname } from './sceneSnapshotBoot.js'
import { decodeSnapshot } from './sceneSnapshotCodec.js'
import { createDefaultSceneSnapshotV1 } from './sceneSnapshot.js'
import {
  buildSnapshotPathname,
  buildSnapshotShareUrlForLocation,
  INITIAL_SNAPSHOT_SHARE_STATE,
  reduceSnapshotShareState,
} from './sceneSnapshotShare.js'

describe('sceneSnapshotShare', () => {
  it('builds canonical `/<payload>` share URLs and drops query/hash from current location', () => {
    const base = createDefaultSceneSnapshotV1()
    const snapshot = {
      ...base,
      focusBody: 'MARS' as const,
      system: {
        ...base.system,
        showRenderHud: true,
      },
    }

    const shareUrl = buildSnapshotShareUrlForLocation(snapshot, 'https://orrery.test/viewer?legacyFlag=1#controls')
    const parsed = new URL(shareUrl)

    expect(parsed.origin).toBe('https://orrery.test')
    expect(parsed.pathname).toMatch(/^\/[A-Za-z0-9_-]+$/)
    expect(parsed.search).toBe('')
    expect(parsed.hash).toBe('')

    const payload = parseSnapshotPayloadFromPathname(parsed.pathname)
    expect(payload).not.toBeNull()

    const decoded = decodeSnapshot(payload ?? '')
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) throw new Error('expected generated share URL payload to decode')

    expect(decoded.snapshot.focusBody).toBe('MARS')
    expect(decoded.snapshot.system.showRenderHud).toBe(true)
  })

  it('builds canonical `/<payload>` path segments', () => {
    expect(buildSnapshotPathname('abc123')).toBe('/abc123')
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
