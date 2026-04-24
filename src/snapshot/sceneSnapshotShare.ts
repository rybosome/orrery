import { SNAPSHOT_PATH_PREFIX } from './sceneSnapshotBoot.js'
import { encodeSnapshot } from './sceneSnapshotCodec.js'
import type { SceneSnapshotV1 } from './sceneSnapshot.js'

export type SnapshotShareCopyStatus = 'idle' | 'copied' | 'copy_failed'

export type SnapshotShareState = {
  generatedUrl: string | null
  copyStatus: SnapshotShareCopyStatus
}

export type SnapshotShareStateEvent = { type: 'generated'; url: string } | { type: 'copy_result'; copied: boolean }

export const INITIAL_SNAPSHOT_SHARE_STATE: SnapshotShareState = {
  generatedUrl: null,
  copyStatus: 'idle',
}

/** Build `/s/<payload>` pathname from an encoded payload. */
export function buildSnapshotPathname(payload: string): string {
  return `${SNAPSHOT_PATH_PREFIX}${payload}`
}

/**
 * Build a canonical snapshot share URL from the current location href.
 *
 * Contract for PR3:
 * - path is forced to `/s/<payload>`
 * - existing query params are dropped
 * - existing hash fragment is dropped
 */
export function buildSnapshotShareUrlForLocation(snapshot: SceneSnapshotV1, locationHref: string): string {
  const payload = encodeSnapshot(snapshot)

  const nextUrl = new URL(locationHref)
  nextUrl.pathname = buildSnapshotPathname(payload)
  nextUrl.search = ''
  nextUrl.hash = ''

  return nextUrl.toString()
}

/**
 * Small state reducer used by the System > State snapshot share controls.
 */
export function reduceSnapshotShareState(state: SnapshotShareState, event: SnapshotShareStateEvent): SnapshotShareState {
  if (event.type === 'generated') {
    return {
      generatedUrl: event.url,
      copyStatus: 'idle',
    }
  }

  if (!state.generatedUrl) return state

  return {
    ...state,
    copyStatus: event.copied ? 'copied' : 'copy_failed',
  }
}
