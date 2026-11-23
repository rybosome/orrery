import type { SceneDefinition } from '../scenes/sceneDefinition.js'
import { playbackDirectionForRate, type SceneSnapshotRestore, type SceneSnapshotView } from './sceneSnapshot.js'
import { decodeSnapshotDocument } from './sceneSnapshotCodec.js'

export type SceneSnapshotV2 = SceneSnapshotView & {
  v: 2
  sceneId: string
  focusBodyId: string
}

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const boolean = (value: unknown): boolean => typeof value === 'boolean'
const range = (low: number, high: number) => (value: unknown) => finite(value) && value >= low && value <= high
const vector = (value: unknown): boolean => Array.isArray(value) && value.length === 3 && value.every(finite)
const pitch = range(-Math.PI / 2, Math.PI / 2)
const color = (value: unknown): boolean => typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)

const viewFields = {
  camera: {
    target: vector,
    radius: range(0.001, 1_000_000),
    yaw: finite,
    pitch,
    lookYaw: finite,
    lookPitch: pitch,
    lookRoll: finite,
  },
  player: {
    etSec: finite,
    rateSecPerSec: finite,
    quantumSec: range(0.001, 86_400),
    stepSec: range(0.001, 31_557_600),
    scrubMinEtSec: finite,
    scrubMaxEtSec: finite,
    playing: boolean,
    direction: (value: unknown) => value === 'paused' || value === 'forward' || value === 'reverse',
  },
  scale: { cameraFovDeg: range(30, 90), sunScaleMultiplier: range(1, 20), planetScaleMultiplier: range(1, 800) },
  guides: {
    showJ2000Axes: boolean,
    showBodyFixedAxes: boolean,
    labelsEnabled: boolean,
    labelOcclusionEnabled: boolean,
  },
  orbitPaths: {
    enabled: boolean,
    lineWidthPx: range(0.5, 10),
    samplesPerOrbit: range(32, 2048),
    maxTotalPoints: range(256, 1_000_000),
  },
  system: { animatedSky: boolean, skyTwinkle: boolean, showRenderHud: boolean },
  rendering: {
    ambientLightIntensity: range(0, 2),
    sunLightIntensity: range(0, 10),
    sunEmissiveIntensity: range(0, 20),
    sunEmissiveColor: color,
    sunPostprocessExposure: range(0, 10),
    sunPostprocessToneMap: (value: unknown) => value === 'none' || value === 'filmic' || value === 'acesLike',
    sunPostprocessBloomThreshold: range(0, 5),
    sunPostprocessBloomStrength: range(0, 2),
    sunPostprocessBloomRadius: range(0, 1),
    sunPostprocessBloomResolutionScale: range(0.1, 1),
  },
} satisfies { [K in keyof SceneSnapshotView]: { [P in keyof SceneSnapshotView[K]]: (value: unknown) => boolean } }

function isSnapshotV2(value: unknown): value is SceneSnapshotV2 {
  const document = asObject(value)
  if (document?.v !== 2 || typeof document.sceneId !== 'string' || typeof document.focusBodyId !== 'string')
    return false
  return Object.entries(viewFields).every(([key, fields]) => {
    const group = asObject(document[key])
    return group != null && Object.entries(fields).every(([field, check]) => check(group[field]))
  })
}

/** Decode a full v2 view and bind it to the scene and body named in the route. */
export function decodeSceneSnapshotV2(payload: string, scene: SceneDefinition): SceneSnapshotRestore | null {
  const decoded = decodeSnapshotDocument(payload)
  if (!decoded.ok || !isSnapshotV2(decoded.document)) return null

  const { sceneId, focusBodyId, camera, player, scale, guides, orbitPaths, system, rendering } = decoded.document
  if (sceneId !== scene.id || !scene.bodies.some((body) => body.id === focusBodyId)) return null
  if (player.scrubMinEtSec >= player.scrubMaxEtSec) return null
  if (
    player.direction !== playbackDirectionForRate(player.rateSecPerSec) ||
    player.playing !== (player.rateSecPerSec !== 0)
  ) {
    return null
  }
  return { focusBody: focusBodyId, camera, player, scale, guides, orbitPaths, system, rendering }
}
