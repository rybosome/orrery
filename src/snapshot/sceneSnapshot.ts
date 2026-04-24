import * as THREE from 'three'

import type { CameraControllerState } from '../controls/CameraController.js'
import { getHomePresetState } from '../interaction/homePresets.js'
import type { SunToneMap } from '../runtimeConfig/sceneCanvasRuntimeConfig.js'
import type { BodyRef } from '../spice/types.js'
import { quantizeEt } from '../time/quantizeEt.js'
import {
  DEFAULT_QUANTUM_SEC,
  DEFAULT_SCRUB_MAX_ET_SEC,
  DEFAULT_SCRUB_MIN_ET_SEC,
  DEFAULT_STEP_SEC,
} from '../time/timeStore.js'

export const SCENE_SNAPSHOT_SCHEMA_VERSION = 1 as const

export type SnapshotPlaybackDirection = 'forward' | 'reverse' | 'paused'

export type SceneSnapshotCameraV1 = {
  target: readonly [number, number, number]
  radius: number
  yaw: number
  pitch: number
  lookYaw: number
  lookPitch: number
  lookRoll: number
}

export type SceneSnapshotPlayerStateV1 = {
  etSec: number
  rateSecPerSec: number
  quantumSec: number
  stepSec: number
  scrubMinEtSec: number
  scrubMaxEtSec: number
  playing: boolean
  direction: SnapshotPlaybackDirection
}

export type SceneSnapshotScaleOptionsV1 = {
  cameraFovDeg: number
  sunScaleMultiplier: number
  planetScaleMultiplier: number
}

export type SceneSnapshotGuideOptionsV1 = {
  showJ2000Axes: boolean
  showBodyFixedAxes: boolean
  labelsEnabled: boolean
  labelOcclusionEnabled: boolean
}

export type SceneSnapshotOrbitPathOptionsV1 = {
  enabled: boolean
  lineWidthPx: number
  samplesPerOrbit: number
  maxTotalPoints: number
}

export type SceneSnapshotSystemOptionsV1 = {
  animatedSky: boolean
  skyTwinkle: boolean
  showRenderHud: boolean
}

export type SceneSnapshotRenderingOptionsV1 = {
  ambientLightIntensity: number
  sunLightIntensity: number
  sunEmissiveIntensity: number
  sunEmissiveColor: string

  sunPostprocessExposure: number
  sunPostprocessToneMap: SunToneMap
  sunPostprocessBloomThreshold: number
  sunPostprocessBloomStrength: number
  sunPostprocessBloomRadius: number
  sunPostprocessBloomResolutionScale: number
}

export type SceneSnapshotV1 = {
  v: typeof SCENE_SNAPSHOT_SCHEMA_VERSION
  camera: SceneSnapshotCameraV1
  focusBody: BodyRef
  player: SceneSnapshotPlayerStateV1
  scale: SceneSnapshotScaleOptionsV1
  guides: SceneSnapshotGuideOptionsV1
  orbitPaths: SceneSnapshotOrbitPathOptionsV1
  system: SceneSnapshotSystemOptionsV1
  rendering: SceneSnapshotRenderingOptionsV1
}

const CAMERA_RADIUS_MIN = 0.001
const CAMERA_RADIUS_MAX = 1_000_000
const CAMERA_PITCH_LIMIT = Math.PI / 2 - 0.01

const QUANTUM_SEC_MIN = 0.001
const QUANTUM_SEC_MAX = 86_400
const STEP_SEC_MIN = 0.001
const STEP_SEC_MAX = 31_557_600

const FOV_DEG_MIN = 30
const FOV_DEG_MAX = 90
const SUN_SCALE_MIN = 1
const SUN_SCALE_MAX = 20
const PLANET_SCALE_MIN = 1
const PLANET_SCALE_MAX = 800

const ORBIT_LINE_WIDTH_MIN = 0.5
const ORBIT_LINE_WIDTH_MAX = 10
const ORBIT_SAMPLES_MIN = 32
const ORBIT_SAMPLES_MAX = 2048
const ORBIT_SAMPLES_STEP = 32
const ORBIT_MAX_POINTS_MIN = 256
const ORBIT_MAX_POINTS_MAX = 1_000_000

const SUN_POSTPROCESS_EXPOSURE_MIN = 0
const SUN_POSTPROCESS_EXPOSURE_MAX = 10
const SUN_BLOOM_THRESHOLD_MIN = 0
const SUN_BLOOM_THRESHOLD_MAX = 5
const SUN_BLOOM_STRENGTH_MIN = 0
const SUN_BLOOM_STRENGTH_MAX = 2
const SUN_BLOOM_RADIUS_MIN = 0
const SUN_BLOOM_RADIUS_MAX = 1
const SUN_BLOOM_RES_SCALE_MIN = 0.1
const SUN_BLOOM_RES_SCALE_MAX = 1

const AMBIENT_LIGHT_INTENSITY_MIN = 0
const AMBIENT_LIGHT_INTENSITY_MAX = 2
const SUN_LIGHT_INTENSITY_MIN = 0
const SUN_LIGHT_INTENSITY_MAX = 10
const SUN_EMISSIVE_INTENSITY_MIN = 0
const SUN_EMISSIVE_INTENSITY_MAX = 20

const DEFAULT_FOCUS_BODY: BodyRef = 'EARTH'

const DEFAULT_CAMERA_STATE: CameraControllerState = getHomePresetState(DEFAULT_FOCUS_BODY) ?? {
  target: new THREE.Vector3(0, 0, 0),
  radius: 1,
  yaw: 0,
  pitch: 0,
  lookYaw: 0,
  lookPitch: 0,
  lookRoll: 0,
}

const COLOR_HEX_RE = /^#(?:[\da-fA-F]{3}|[\da-fA-F]{6})$/

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step
}

function normalizeBodyRef(value: unknown, fallback: BodyRef): BodyRef {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return fallback
}

function normalizeToneMap(value: unknown, fallback: SunToneMap): SunToneMap {
  if (value === 'none' || value === 'filmic' || value === 'acesLike') return value
  return fallback
}

function normalizeColorHex(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback

  const trimmed = value.trim()
  if (!COLOR_HEX_RE.test(trimmed)) return fallback

  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase()
  }

  return trimmed.toLowerCase()
}

function normalizeTarget(
  value: unknown,
  fallback: readonly [number, number, number],
): readonly [number, number, number] {
  if (Array.isArray(value) && value.length === 3) {
    const x = asFiniteNumber(value[0], fallback[0])
    const y = asFiniteNumber(value[1], fallback[1])
    const z = asFiniteNumber(value[2], fallback[2])
    return [x, y, z]
  }

  const record = asRecord(value)
  if (record) {
    const x = asFiniteNumber(record.x, fallback[0])
    const y = asFiniteNumber(record.y, fallback[1])
    const z = asFiniteNumber(record.z, fallback[2])
    return [x, y, z]
  }

  return fallback
}

/** Derive canonical playback direction from the signed playback rate. */
export function playbackDirectionForRate(rateSecPerSec: number): SnapshotPlaybackDirection {
  if (rateSecPerSec > 0) return 'forward'
  if (rateSecPerSec < 0) return 'reverse'
  return 'paused'
}

/** Convert `CameraControllerState` into the JSON-friendly snapshot camera shape. */
export function cameraControllerStateToSnapshotCamera(state: CameraControllerState): SceneSnapshotCameraV1 {
  return {
    target: [state.target.x, state.target.y, state.target.z],
    radius: state.radius,
    yaw: state.yaw,
    pitch: state.pitch,
    lookYaw: state.lookYaw ?? 0,
    lookPitch: state.lookPitch ?? 0,
    lookRoll: state.lookRoll ?? 0,
  }
}

/** Convert a snapshot camera payload back into `CameraControllerState`. */
export function snapshotCameraToControllerState(camera: SceneSnapshotCameraV1): CameraControllerState {
  return {
    target: new THREE.Vector3(camera.target[0], camera.target[1], camera.target[2]),
    radius: camera.radius,
    yaw: camera.yaw,
    pitch: camera.pitch,
    lookYaw: camera.lookYaw,
    lookPitch: camera.lookPitch,
    lookRoll: camera.lookRoll,
  }
}

/** Build the default v1 snapshot used as the normalization fallback baseline. */
export function createDefaultSceneSnapshotV1(): SceneSnapshotV1 {
  const camera = cameraControllerStateToSnapshotCamera(DEFAULT_CAMERA_STATE)

  return {
    v: SCENE_SNAPSHOT_SCHEMA_VERSION,
    camera,
    focusBody: DEFAULT_FOCUS_BODY,
    player: {
      etSec: quantizeEt(0, DEFAULT_QUANTUM_SEC),
      rateSecPerSec: 0,
      quantumSec: DEFAULT_QUANTUM_SEC,
      stepSec: DEFAULT_STEP_SEC,
      scrubMinEtSec: DEFAULT_SCRUB_MIN_ET_SEC,
      scrubMaxEtSec: DEFAULT_SCRUB_MAX_ET_SEC,
      playing: false,
      direction: 'paused',
    },
    scale: {
      cameraFovDeg: 50,
      sunScaleMultiplier: 1,
      planetScaleMultiplier: 1,
    },
    guides: {
      showJ2000Axes: false,
      showBodyFixedAxes: false,
      labelsEnabled: false,
      labelOcclusionEnabled: false,
    },
    orbitPaths: {
      enabled: false,
      lineWidthPx: 1.5,
      samplesPerOrbit: 512,
      maxTotalPoints: 10_000,
    },
    system: {
      animatedSky: true,
      skyTwinkle: false,
      showRenderHud: false,
    },
    rendering: {
      ambientLightIntensity: 0.45,
      sunLightIntensity: 2.1,
      sunEmissiveIntensity: 10,
      sunEmissiveColor: '#ffcc55',
      sunPostprocessExposure: 1.5,
      sunPostprocessToneMap: 'acesLike',
      sunPostprocessBloomThreshold: 1.5,
      sunPostprocessBloomStrength: 0.15,
      sunPostprocessBloomRadius: 0.05,
      sunPostprocessBloomResolutionScale: 1,
    },
  }
}

/**
 * Normalize arbitrary input into the canonical v1 snapshot shape.
 *
 * This centralizes validation, clamping, and fallback behavior.
 */
export function normalizeSceneSnapshot(input: unknown): SceneSnapshotV1 {
  const defaults = createDefaultSceneSnapshotV1()
  const root = asRecord(input)

  const cameraRaw = asRecord(root?.camera)
  const playerRaw = asRecord(root?.player)
  const scaleRaw = asRecord(root?.scale)
  const guidesRaw = asRecord(root?.guides)
  const orbitRaw = asRecord(root?.orbitPaths)
  const systemRaw = asRecord(root?.system)
  const renderingRaw = asRecord(root?.rendering)

  const camera = {
    target: normalizeTarget(cameraRaw?.target, defaults.camera.target),
    radius: clamp(asFiniteNumber(cameraRaw?.radius, defaults.camera.radius), CAMERA_RADIUS_MIN, CAMERA_RADIUS_MAX),
    yaw: asFiniteNumber(cameraRaw?.yaw, defaults.camera.yaw),
    pitch: clamp(asFiniteNumber(cameraRaw?.pitch, defaults.camera.pitch), -CAMERA_PITCH_LIMIT, CAMERA_PITCH_LIMIT),
    lookYaw: asFiniteNumber(cameraRaw?.lookYaw, defaults.camera.lookYaw),
    lookPitch: clamp(
      asFiniteNumber(cameraRaw?.lookPitch, defaults.camera.lookPitch),
      -CAMERA_PITCH_LIMIT,
      CAMERA_PITCH_LIMIT,
    ),
    lookRoll: asFiniteNumber(cameraRaw?.lookRoll, defaults.camera.lookRoll),
  } satisfies SceneSnapshotCameraV1

  const scrubMinEtSec = asFiniteNumber(playerRaw?.scrubMinEtSec, defaults.player.scrubMinEtSec)
  const scrubMaxEtSec = asFiniteNumber(playerRaw?.scrubMaxEtSec, defaults.player.scrubMaxEtSec)
  const hasValidScrubRange = scrubMinEtSec < scrubMaxEtSec

  const normalizedScrubMinEtSec = hasValidScrubRange ? scrubMinEtSec : defaults.player.scrubMinEtSec
  const normalizedScrubMaxEtSec = hasValidScrubRange ? scrubMaxEtSec : defaults.player.scrubMaxEtSec

  const quantumSec = clamp(
    asFiniteNumber(playerRaw?.quantumSec, defaults.player.quantumSec),
    QUANTUM_SEC_MIN,
    QUANTUM_SEC_MAX,
  )
  const stepSec = clamp(asFiniteNumber(playerRaw?.stepSec, defaults.player.stepSec), STEP_SEC_MIN, STEP_SEC_MAX)

  const rawEtSec = asFiniteNumber(playerRaw?.etSec, defaults.player.etSec)
  const clampedEtSec = clamp(rawEtSec, normalizedScrubMinEtSec, normalizedScrubMaxEtSec)
  const etSec = quantizeEt(clampedEtSec, quantumSec)

  const rateSecPerSec = asFiniteNumber(playerRaw?.rateSecPerSec, defaults.player.rateSecPerSec)
  const direction = playbackDirectionForRate(rateSecPerSec)

  const player: SceneSnapshotPlayerStateV1 = {
    etSec,
    rateSecPerSec,
    quantumSec,
    stepSec,
    scrubMinEtSec: normalizedScrubMinEtSec,
    scrubMaxEtSec: normalizedScrubMaxEtSec,
    playing: direction !== 'paused',
    direction,
  }

  const scale: SceneSnapshotScaleOptionsV1 = {
    cameraFovDeg: clamp(asFiniteNumber(scaleRaw?.cameraFovDeg, defaults.scale.cameraFovDeg), FOV_DEG_MIN, FOV_DEG_MAX),
    sunScaleMultiplier: clamp(
      asFiniteNumber(scaleRaw?.sunScaleMultiplier, defaults.scale.sunScaleMultiplier),
      SUN_SCALE_MIN,
      SUN_SCALE_MAX,
    ),
    planetScaleMultiplier: clamp(
      asFiniteNumber(scaleRaw?.planetScaleMultiplier, defaults.scale.planetScaleMultiplier),
      PLANET_SCALE_MIN,
      PLANET_SCALE_MAX,
    ),
  }

  const guides: SceneSnapshotGuideOptionsV1 = {
    showJ2000Axes: asBoolean(guidesRaw?.showJ2000Axes, defaults.guides.showJ2000Axes),
    showBodyFixedAxes: asBoolean(guidesRaw?.showBodyFixedAxes, defaults.guides.showBodyFixedAxes),
    labelsEnabled: asBoolean(guidesRaw?.labelsEnabled, defaults.guides.labelsEnabled),
    labelOcclusionEnabled: asBoolean(guidesRaw?.labelOcclusionEnabled, defaults.guides.labelOcclusionEnabled),
  }

  const orbitPaths: SceneSnapshotOrbitPathOptionsV1 = {
    enabled: asBoolean(orbitRaw?.enabled, defaults.orbitPaths.enabled),
    lineWidthPx: clamp(
      asFiniteNumber(orbitRaw?.lineWidthPx, defaults.orbitPaths.lineWidthPx),
      ORBIT_LINE_WIDTH_MIN,
      ORBIT_LINE_WIDTH_MAX,
    ),
    samplesPerOrbit: clamp(
      roundToStep(asFiniteNumber(orbitRaw?.samplesPerOrbit, defaults.orbitPaths.samplesPerOrbit), ORBIT_SAMPLES_STEP),
      ORBIT_SAMPLES_MIN,
      ORBIT_SAMPLES_MAX,
    ),
    maxTotalPoints: clamp(
      Math.round(asFiniteNumber(orbitRaw?.maxTotalPoints, defaults.orbitPaths.maxTotalPoints)),
      ORBIT_MAX_POINTS_MIN,
      ORBIT_MAX_POINTS_MAX,
    ),
  }

  const system: SceneSnapshotSystemOptionsV1 = {
    animatedSky: asBoolean(systemRaw?.animatedSky, defaults.system.animatedSky),
    skyTwinkle: asBoolean(systemRaw?.skyTwinkle, defaults.system.skyTwinkle),
    showRenderHud: asBoolean(systemRaw?.showRenderHud, defaults.system.showRenderHud),
  }

  const rendering: SceneSnapshotRenderingOptionsV1 = {
    ambientLightIntensity: clamp(
      asFiniteNumber(renderingRaw?.ambientLightIntensity, defaults.rendering.ambientLightIntensity),
      AMBIENT_LIGHT_INTENSITY_MIN,
      AMBIENT_LIGHT_INTENSITY_MAX,
    ),
    sunLightIntensity: clamp(
      asFiniteNumber(renderingRaw?.sunLightIntensity, defaults.rendering.sunLightIntensity),
      SUN_LIGHT_INTENSITY_MIN,
      SUN_LIGHT_INTENSITY_MAX,
    ),
    sunEmissiveIntensity: clamp(
      asFiniteNumber(renderingRaw?.sunEmissiveIntensity, defaults.rendering.sunEmissiveIntensity),
      SUN_EMISSIVE_INTENSITY_MIN,
      SUN_EMISSIVE_INTENSITY_MAX,
    ),
    sunEmissiveColor: normalizeColorHex(renderingRaw?.sunEmissiveColor, defaults.rendering.sunEmissiveColor),
    sunPostprocessExposure: clamp(
      asFiniteNumber(renderingRaw?.sunPostprocessExposure, defaults.rendering.sunPostprocessExposure),
      SUN_POSTPROCESS_EXPOSURE_MIN,
      SUN_POSTPROCESS_EXPOSURE_MAX,
    ),
    sunPostprocessToneMap: normalizeToneMap(
      renderingRaw?.sunPostprocessToneMap,
      defaults.rendering.sunPostprocessToneMap,
    ),
    sunPostprocessBloomThreshold: clamp(
      asFiniteNumber(renderingRaw?.sunPostprocessBloomThreshold, defaults.rendering.sunPostprocessBloomThreshold),
      SUN_BLOOM_THRESHOLD_MIN,
      SUN_BLOOM_THRESHOLD_MAX,
    ),
    sunPostprocessBloomStrength: clamp(
      asFiniteNumber(renderingRaw?.sunPostprocessBloomStrength, defaults.rendering.sunPostprocessBloomStrength),
      SUN_BLOOM_STRENGTH_MIN,
      SUN_BLOOM_STRENGTH_MAX,
    ),
    sunPostprocessBloomRadius: clamp(
      asFiniteNumber(renderingRaw?.sunPostprocessBloomRadius, defaults.rendering.sunPostprocessBloomRadius),
      SUN_BLOOM_RADIUS_MIN,
      SUN_BLOOM_RADIUS_MAX,
    ),
    sunPostprocessBloomResolutionScale: clamp(
      asFiniteNumber(
        renderingRaw?.sunPostprocessBloomResolutionScale,
        defaults.rendering.sunPostprocessBloomResolutionScale,
      ),
      SUN_BLOOM_RES_SCALE_MIN,
      SUN_BLOOM_RES_SCALE_MAX,
    ),
  }

  return {
    v: SCENE_SNAPSHOT_SCHEMA_VERSION,
    camera,
    focusBody: normalizeBodyRef(root?.focusBody, defaults.focusBody),
    player,
    scale,
    guides,
    orbitPaths,
    system,
    rendering,
  }
}
