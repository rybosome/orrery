import { buildScenePath } from '../scenes/sceneRoute.js'
import type { SceneSnapshotV2 } from './sceneSnapshotV2.js'
import { encodeSnapshotDocument } from './sceneSnapshotCodec.js'

export type SnapshotShareCopyStatus = 'idle' | 'copied' | 'copy_failed'

export type SnapshotShareState = {
  generatedUrl: string | null
  copyStatus: SnapshotShareCopyStatus
}

export type SnapshotShareStateEvent =
  | { type: 'generated'; url: string }
  | { type: 'copy_result'; copied: boolean; attemptedUrl: string }

export const INITIAL_SNAPSHOT_SHARE_STATE: SnapshotShareState = {
  generatedUrl: null,
  copyStatus: 'idle',
}

/** Build a v2 share URL rooted at the app's deployment base. */
export function buildSceneSnapshotShareUrl(snapshot: SceneSnapshotV2, locationHref: string, base: string): string {
  const path = `${buildScenePath(snapshot.sceneId, base)}/s/${encodeSnapshotDocument(snapshot)}`
  return new URL(path, locationHref).toString()
}

/**
 * Small state reducer used by the System > State snapshot share controls.
 */
export function reduceSnapshotShareState(
  state: SnapshotShareState,
  event: SnapshotShareStateEvent,
): SnapshotShareState {
  if (event.type === 'generated') {
    return {
      generatedUrl: event.url,
      copyStatus: 'idle',
    }
  }

  if (!state.generatedUrl) return state
  if (event.attemptedUrl !== state.generatedUrl) return state

  return {
    ...state,
    copyStatus: event.copied ? 'copied' : 'copy_failed',
  }
}
