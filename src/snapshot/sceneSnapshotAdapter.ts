import type { CameraController } from '../controls/CameraController.js'
import type { BodyRef } from '../spice/types.js'
import type { TimeState } from '../time/timeStore.js'
import {
  SCENE_SNAPSHOT_SCHEMA_VERSION,
  cameraControllerStateToSnapshotCamera,
  normalizeSceneSnapshot,
  playbackDirectionForRate,
  type SceneSnapshotCameraV1,
  type SceneSnapshotGuideOptionsV1,
  type SceneSnapshotOrbitPathOptionsV1,
  type SceneSnapshotPlayerStateV1,
  type SceneSnapshotRenderingOptionsV1,
  type SceneSnapshotScaleOptionsV1,
  type SceneSnapshotSystemOptionsV1,
  type SceneSnapshotV1,
} from './sceneSnapshot.js'

export type SceneSnapshotCaptureInput = {
  controller: CameraController
  focusBody: BodyRef
  time: TimeState
  scale: SceneSnapshotScaleOptionsV1
  guides: SceneSnapshotGuideOptionsV1
  orbitPaths: SceneSnapshotOrbitPathOptionsV1
  system: SceneSnapshotSystemOptionsV1
  rendering: SceneSnapshotRenderingOptionsV1
}

export type SceneSnapshotApplyInput = {
  cancelFocusTween: () => void
  setSkipAutoZoomForFocusBody: (focusBody: BodyRef | null) => void

  applyScale: (next: SceneSnapshotScaleOptionsV1) => void
  applyGuides: (next: SceneSnapshotGuideOptionsV1) => void
  applyOrbitPaths: (next: SceneSnapshotOrbitPathOptionsV1) => void
  applySystem: (next: SceneSnapshotSystemOptionsV1) => void
  applyRendering: (next: SceneSnapshotRenderingOptionsV1) => void

  applyFocusBody: (focusBody: BodyRef) => void
  applyPlayer: (next: SceneSnapshotPlayerStateV1) => void

  /**
   * Optional explicit bridge to the existing runtime `updateScene` pathway.
   *
   * If provided, this runs after focus/player/UI state has been queued and before
   * camera restore, which helps avoid focus/camera/time stomping.
   */
  flushSceneUpdate?: (snapshot: SceneSnapshotV1) => void | Promise<void>

  applyCamera: (next: SceneSnapshotCameraV1) => void
}

/** Monotonic-now helper used by snapshot timing telemetry. */
export function monotonicNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

/** Measure the elapsed duration of a snapshot-apply operation. */
export async function measureSnapshotApplyDuration<T>(
  apply: () => Promise<T> | T,
): Promise<{ result: T; durationMs: number }> {
  const startedAtMs = monotonicNowMs()
  const result = await apply()
  return {
    result,
    durationMs: monotonicNowMs() - startedAtMs,
  }
}

/** Capture a canonical snapshot from live controller/time/UI state. */
export function captureSnapshot(input: SceneSnapshotCaptureInput): SceneSnapshotV1 {
  const direction = playbackDirectionForRate(input.time.rateSecPerSec)

  const snapshot = {
    v: SCENE_SNAPSHOT_SCHEMA_VERSION,
    camera: cameraControllerStateToSnapshotCamera(input.controller.snapshot()),
    focusBody: input.focusBody,
    player: {
      etSec: input.time.etSec,
      rateSecPerSec: input.time.rateSecPerSec,
      quantumSec: input.time.quantumSec,
      stepSec: input.time.stepSec,
      scrubMinEtSec: input.time.scrubMinEtSec,
      scrubMaxEtSec: input.time.scrubMaxEtSec,
      playing: direction !== 'paused',
      direction,
    },
    scale: input.scale,
    guides: input.guides,
    orbitPaths: input.orbitPaths,
    system: input.system,
    rendering: input.rendering,
  } satisfies SceneSnapshotV1

  return normalizeSceneSnapshot(snapshot)
}

/**
 * Apply a snapshot in deterministic phases.
 *
 * Ordering is intentional to preserve existing runtime behavior while avoiding
 * focus/camera/time stomping:
 * 1) freeze in-flight focus tweens + set one-shot focus auto-zoom skip token
 * 2) queue UI groups (scale/guides/orbits/system/rendering)
 * 3) queue focus + player state
 * 4) optionally flush through existing runtime `updateScene`
 * 5) restore camera last
 */
export async function applySnapshot(
  snapshotInput: SceneSnapshotV1,
  input: SceneSnapshotApplyInput,
): Promise<SceneSnapshotV1> {
  const snapshot = normalizeSceneSnapshot(snapshotInput)

  input.cancelFocusTween()
  input.setSkipAutoZoomForFocusBody(snapshot.focusBody)

  input.applyScale(snapshot.scale)
  input.applyGuides(snapshot.guides)
  input.applyOrbitPaths(snapshot.orbitPaths)
  input.applySystem(snapshot.system)
  input.applyRendering(snapshot.rendering)

  input.applyFocusBody(snapshot.focusBody)
  input.applyPlayer(snapshot.player)

  await input.flushSceneUpdate?.(snapshot)

  input.applyCamera(snapshot.camera)

  return snapshot
}
