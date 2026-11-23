import type { SceneSnapshotRestore } from '../snapshot/sceneSnapshot.js'
import { decodeSnapshot } from '../snapshot/sceneSnapshotCodec.js'
import { decodeSceneSnapshotV2 } from '../snapshot/sceneSnapshotV2.js'
import { resolveSolV1Focus } from '../snapshot/solV1Focus.js'
import { DEFAULT_SCENE, getSceneDefinition } from './sceneCatalog.js'
import type { SceneDefinition } from './sceneDefinition.js'

export type SceneRoute =
  | { kind: 'scene'; scene: SceneDefinition; snapshot?: SceneSnapshotRestore; invalidSnapshot?: boolean }
  | { kind: 'unknown'; path: string }

function mountPath(base: string): string {
  return new URL(base, 'https://orrery.invalid/').pathname.replace(/\/+$/, '')
}

/** Build an ordinary scene path under the app's deployment base. */
export function buildScenePath(sceneId: string, base: string): string {
  return `${mountPath(base)}/${sceneId}`
}

/** On a bare app entry, return its canonical default scene path. */
export function canonicalHomePath(pathname: string, base: string): string | undefined {
  const mount = mountPath(base)
  if (pathname === mount || pathname === `${mount}/`) return buildScenePath(DEFAULT_SCENE.id, base)
  return undefined
}

function readLegacyView(payload: string): SceneSnapshotRestore | undefined {
  const decoded = decodeSnapshot(payload)
  if (!decoded.ok) return undefined
  const focusBody = resolveSolV1Focus(decoded.snapshot.focusBody) ?? DEFAULT_SCENE.viewer.initialFocusId
  return { ...decoded.snapshot, focusBody }
}

/** Resolve scene IDs before the ambiguous bare-root v1 snapshot shape. */
export function resolveSceneRoute(pathname: string, base: string): SceneRoute {
  const mount = mountPath(base)
  const unknown: SceneRoute = { kind: 'unknown', path: pathname }
  if (pathname !== mount && !pathname.startsWith(`${mount}/`)) return unknown

  const path = pathname.slice(mount.length)
  if (path === '' || path === '/') return { kind: 'scene', scene: DEFAULT_SCENE }
  const [first, ...rest] = path.slice(1).split('/')
  const scene = getSceneDefinition(first)
  if (scene) {
    if (!rest.length || (rest.length === 1 && rest[0] === '')) return { kind: 'scene', scene }
    if (rest[0] !== 's') return unknown
    const snapshot = rest.length === 2 ? decodeSceneSnapshotV2(rest[1], scene) : null
    return snapshot ? { kind: 'scene', scene, snapshot } : { kind: 'scene', scene, invalidSnapshot: true }
  }
  if (first === 's' && rest.length) {
    const snapshot = rest.length === 1 ? readLegacyView(rest[0]) : undefined
    return { kind: 'scene', scene: DEFAULT_SCENE, snapshot, invalidSnapshot: !snapshot }
  }
  if (rest.length === 0) {
    const snapshot = readLegacyView(first)
    if (snapshot) return { kind: 'scene', scene: DEFAULT_SCENE, snapshot }
  }
  return unknown
}
