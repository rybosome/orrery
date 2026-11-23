import type { KernelPack } from '@rybosome/tspice'

import type { SceneBody } from '../scene/SceneModel.js'
import type { BodyRef, FrameId } from '../spice/types.js'

export interface SceneBodyDefinition extends SceneBody {
  id: string
  kind: 'star' | 'planet' | 'moon'
  orbitGuide?: { center: BodyRef; spanSec: number; resampleEverySec: number }
}

export interface SceneTimeDefinition {
  minUtc: string
  maxUtc: string
  initialEtSec: number
  quantumSec: number
  stepSec: number
  rateLadder: readonly number[]
  resumeRates: { closeSecPerSec: number; wideSecPerSec: number }
}

export interface SceneDefinition {
  id: string
  title: string
  kernelPack: KernelPack
  coordinates: { frame: FrameId; observer: BodyRef }
  bodies: readonly SceneBodyDefinition[]
  primaryLight: { bodyId: string; color: string; intensity: number }
  time: SceneTimeDefinition
  viewer: {
    initialFocusId: string
    cameraFovDeg: number
    ambientLightIntensity: number
    starEmission: { intensity: number; color: string }
  }
}

const SCENE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function isNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

/** Check the numeric settings and cross-references of an authored scene. */
export function validateSceneDefinition(scene: SceneDefinition): void {
  const fail = (message: string): never => {
    throw new Error(`Scene "${scene.id}": ${message}`)
  }

  if (!SCENE_ID.test(scene.id)) fail('Invalid scene ID')

  const bodies = new Map<string, SceneBodyDefinition>()
  for (const body of scene.bodies) {
    if (!body.id.trim() || bodies.has(body.id)) fail(`Invalid or duplicate body ID "${body.id}"`)
    if (!isPositive(body.style.radiusKm)) fail(`Invalid radius for "${body.id}"`)
    if (body.orbitGuide && (!isPositive(body.orbitGuide.spanSec) || !isPositive(body.orbitGuide.resampleEverySec))) {
      fail(`Invalid orbit guide sampling for "${body.id}"`)
    }
    bodies.set(body.id, body)
  }

  if (!bodies.has(scene.viewer.initialFocusId)) fail('Initial focus must name a scene body')
  if (
    bodies.get(scene.primaryLight.bodyId)?.kind !== 'star' ||
    scene.bodies.filter((body) => body.kind === 'star').length !== 1
  ) {
    fail('Primary light must name the scene’s only star')
  }

  const { primaryLight, viewer, time, kernelPack } = scene
  if (!primaryLight.color.trim() || !isNonNegative(primaryLight.intensity)) fail('Invalid primary light')
  if (
    !isPositive(viewer.cameraFovDeg) ||
    viewer.cameraFovDeg >= 180 ||
    !isNonNegative(viewer.ambientLightIntensity) ||
    !isNonNegative(viewer.starEmission.intensity) ||
    !viewer.starEmission.color.trim()
  ) {
    fail('Invalid viewer defaults')
  }

  if (
    !time.minUtc.endsWith('Z') ||
    !time.maxUtc.endsWith('Z') ||
    !(Date.parse(time.minUtc) < Date.parse(time.maxUtc)) ||
    !Number.isFinite(time.initialEtSec) ||
    !isPositive(time.quantumSec) ||
    !isPositive(time.stepSec)
  ) {
    fail('Invalid time bounds or step settings')
  }
  if (
    !time.rateLadder.includes(0) ||
    time.rateLadder.some((rate, index, rates) => !Number.isFinite(rate) || (index > 0 && rate <= rates[index - 1]))
  ) {
    fail('Playback rates must be finite, increasing, and include zero')
  }
  if (!isPositive(time.resumeRates.closeSecPerSec) || !isPositive(time.resumeRates.wideSecPerSec)) {
    fail('Invalid playback resume rates')
  }

  if (kernelPack.kernels.length === 0 || (kernelPack.baseUrl != null && !kernelPack.baseUrl.endsWith('/'))) {
    fail('Kernel pack requires entries and a directory-style base URL')
  }
  const kernelPaths = new Set<string>()
  for (const kernel of kernelPack.kernels) {
    if (!kernel.path.trim() || !kernel.url.trim() || kernelPaths.has(kernel.path)) {
      fail(`Invalid or duplicate kernel path "${kernel.path}"`)
    }
    kernelPaths.add(kernel.path)
  }
}
