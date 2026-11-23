import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { SpiceAsync } from '@rybosome/tspice'

import { quantizeEt } from '../../time/quantizeEt.js'
import type { BodyRef, EtSeconds, FrameId, Vec3Km } from '../../spice/types.js'
import { rebasePositionKm } from '../precision.js'

export type OrbitPathsSettings = {
  lineWidthPx: number
  samplesPerOrbit: number
  maxTotalPoints: number
  minPointsPerOrbit: number
  antialias: boolean
}

export type OrbitPathsBodySpec = {
  id: string
  target: BodyRef
  center: BodyRef
  spanSec: number
  periodSec?: number
  resampleEverySec: number
  color: THREE.ColorRepresentation
}

type OrbitPathState = {
  guide: OrbitPathsBodySpec

  group: THREE.Group
  material: LineMaterial

  segments: {
    geometry: LineGeometry
    line: Line2
  }[]

  hasGeometry: boolean
  wasVisible: boolean

  lastAnchorEtSec?: number
  lastPoints?: number
  lastSettingsKey?: string
  lastMaterialKey?: string

  inFlight?: {
    token: number
    abort: AbortController
  }
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function setAlphaToCoverage(material: THREE.Material, enabled: boolean): void {
  // `alphaToCoverage` is not present in all Three.js versions/materials.
  // Guard to avoid relying on `any` casts.
  const m = material as unknown as Record<string, unknown>
  if (!('alphaToCoverage' in m)) return

  try {
    const didSet = Reflect.set(m, 'alphaToCoverage', enabled)
    if (!didSet) return
    if (typeof m.alphaToCoverage !== 'boolean') return
  } catch {
    // If this is non-writable in a given Three.js version/material, fail silently.
  }
}

function computePointsPerOrbit(opts: {
  samplesPerOrbit: number
  maxTotalPoints: number
  minPointsPerOrbit: number
  visibleOrbits: number
}): number {
  const { samplesPerOrbit, maxTotalPoints, minPointsPerOrbit, visibleOrbits } = opts
  if (visibleOrbits <= 0) return Math.max(2, Math.floor(samplesPerOrbit))

  const perOrbitBudget = Math.floor(maxTotalPoints / visibleOrbits)

  // If the global budget is too small to honor the floor, degrade gracefully.
  const minPoints = perOrbitBudget > 0 ? Math.min(minPointsPerOrbit, perOrbitBudget) : 2

  return THREE.MathUtils.clamp(
    Math.min(samplesPerOrbit, perOrbitBudget || samplesPerOrbit),
    Math.max(2, minPoints),
    Math.max(2, samplesPerOrbit),
  )
}

/**
 * Orbit path line renderer that samples SPICE positions and updates line geometry over time.
 */
export class OrbitPaths {
  readonly object: THREE.Group

  private readonly spice: SpiceAsync
  private readonly kmToWorld: number
  private readonly frame: FrameId
  private readonly bounds: { minEtSec: number; maxEtSec: number }
  private readonly invalidate: () => void
  private readonly orbits: OrbitPathState[]
  private readonly resolution = new THREE.Vector2(1, 1)
  private samplingToken = 0

  /** Create orbit paths for the provided bodies (sampling happens on-demand in {@link update}). */
  constructor(opts: {
    spice: SpiceAsync
    kmToWorld: number
    frame: FrameId
    bounds: { minEtSec: number; maxEtSec: number }
    guides: readonly OrbitPathsBodySpec[]
    invalidate: () => void
  }) {
    this.spice = opts.spice
    this.kmToWorld = opts.kmToWorld
    this.frame = opts.frame
    this.bounds = opts.bounds
    this.invalidate = opts.invalidate
    this.object = new THREE.Group()
    this.object.name = 'OrbitPaths'

    const orbits: OrbitPathState[] = []
    for (const guide of opts.guides) {
      const group = new THREE.Group()
      group.name = `OrbitPath(${guide.id})`

      const material = new LineMaterial({
        color: new THREE.Color(guide.color).getHex(),
        linewidth: 1,
        worldUnits: false,
        transparent: true,
        opacity: 0.9,
        depthTest: true,
        depthWrite: false,
      })
      material.resolution.copy(this.resolution)
      this.object.add(group)

      orbits.push({
        guide,
        group,
        material,
        segments: [],
        hasGeometry: false,
        wasVisible: false,
      })
    }

    this.orbits = orbits
  }

  /** Update material resolution (required by `LineMaterial` for correct line widths). */
  setResolution(widthPx: number, heightPx: number) {
    this.resolution.set(Math.max(1, widthPx), Math.max(1, heightPx))
    for (const o of this.orbits) {
      o.material.resolution.copy(this.resolution)
    }
  }

  /** Dispose all geometries/materials and abort any in-flight sampling. */
  dispose() {
    for (const o of this.orbits) {
      o.inFlight?.abort.abort()

      for (const s of o.segments) {
        s.geometry.dispose()
      }

      o.material.dispose()
    }
  }

  /**
   * Update visibility/placement and (re)sample orbit geometries as needed for the current time.
   */
  update(input: {
    etSec: EtSeconds
    focusPosKm: Vec3Km
    centerPositions: ReadonlyMap<string, Vec3Km>
    bodyVisibility: ReadonlyMap<string, boolean>
    settings: OrbitPathsSettings
  }) {
    const visibleOrbits = this.orbits.filter((o) => input.bodyVisibility.get(o.guide.id) !== false)
    const pointsPerOrbit = computePointsPerOrbit({
      samplesPerOrbit: input.settings.samplesPerOrbit,
      maxTotalPoints: input.settings.maxTotalPoints,
      minPointsPerOrbit: input.settings.minPointsPerOrbit,
      visibleOrbits: visibleOrbits.length,
    })

    const settingsKey = `${input.settings.lineWidthPx}|${pointsPerOrbit}|${input.settings.antialias}`

    for (const o of this.orbits) {
      const targetKey = o.guide.id
      const visible = input.bodyVisibility.get(targetKey) !== false

      const primaryPosKm = input.centerPositions.get(String(o.guide.center))
      const canPlace = Boolean(primaryPosKm)

      // If we don't know where the primary is, hide the orbit to avoid placing it at origin.
      o.group.visible = visible && canPlace

      if (o.group.visible && primaryPosKm) {
        const rebasedKm = rebasePositionKm(primaryPosKm, input.focusPosKm)
        o.group.position.set(
          rebasedKm[0] * this.kmToWorld,
          rebasedKm[1] * this.kmToWorld,
          rebasedKm[2] * this.kmToWorld,
        )
      }

      // Apply material settings even if hidden (so it looks correct when enabled).
      const materialKey = `${input.settings.lineWidthPx}|${input.settings.antialias}`
      if (o.lastMaterialKey !== materialKey) {
        o.lastMaterialKey = materialKey
        o.material.linewidth = input.settings.lineWidthPx
        setAlphaToCoverage(o.material, Boolean(input.settings.antialias))
        o.material.needsUpdate = true
      }

      const anchorEtSec = quantizeEt(input.etSec, o.guide.resampleEverySec)

      const becameVisible = visible && !o.wasVisible
      o.wasVisible = visible

      const shouldResample =
        o.group.visible &&
        (becameVisible ||
          o.lastAnchorEtSec !== anchorEtSec ||
          o.lastPoints !== pointsPerOrbit ||
          o.lastSettingsKey !== settingsKey)

      if (shouldResample) {
        o.lastAnchorEtSec = anchorEtSec
        o.lastPoints = pointsPerOrbit
        o.lastSettingsKey = settingsKey
        this.startSampling(o, { anchorEtSec, points: pointsPerOrbit })
      }
    }
  }

  private startSampling(o: OrbitPathState, opts: { anchorEtSec: number; points: number }) {
    o.inFlight?.abort.abort()

    const token = ++this.samplingToken
    const abort = new AbortController()
    o.inFlight = { token, abort }

    void this.sampleOrbitPositionsKm({
      guide: o.guide,
      anchorEtSec: opts.anchorEtSec,
      points: opts.points,
      signal: abort.signal,
    })
      .then((segmentsKm) => {
        if (abort.signal.aborted) return
        if (o.inFlight?.token !== token) return
        o.inFlight = undefined

        // If sampling succeeded but returned too few positions, treat it as failure.
        if (segmentsKm.length === 0) {
          // Hide only if we've never had usable geometry; otherwise keep the last good path.
          console.warn('Orbit guide has no usable samples', o.guide.id)
          if (!o.hasGeometry) {
            o.group.visible = false
          }
          return
        }

        const segmentsWorld: number[][] = []
        for (const segKm of segmentsKm) {
          const positionsWorld: number[] = new Array(segKm.length * 3)
          for (let i = 0; i < segKm.length; i++) {
            const p = segKm[i]!
            positionsWorld[i * 3 + 0] = p[0] * this.kmToWorld
            positionsWorld[i * 3 + 1] = p[1] * this.kmToWorld
            positionsWorld[i * 3 + 2] = p[2] * this.kmToWorld
          }
          segmentsWorld.push(positionsWorld)
        }

        this.setOrbitSegments(o, segmentsWorld)
        o.hasGeometry = true
        this.invalidate()
      })
      .catch((err) => {
        // Best-effort: don't crash the viewer if an orbit can't be sampled.
        // (Common cause: missing kernels for a body.)
        console.warn('Orbit path sampling failed', { target: o.guide.target, center: o.guide.center }, err)
        if (abort.signal.aborted) return
        if (o.inFlight?.token !== token) return
        o.inFlight = undefined

        // Hide the orbit if it never produced valid geometry.
        if (!o.hasGeometry) {
          o.group.visible = false
        }
      })
  }

  private setOrbitSegments(o: OrbitPathState, segmentsWorld: readonly number[][]) {
    // Ensure we have enough line objects.
    for (let i = o.segments.length; i < segmentsWorld.length; i++) {
      const geometry = new LineGeometry()
      const line = new Line2(geometry, o.material)
      line.frustumCulled = false
      line.name = `OrbitLine(${o.guide.id})#${i}`
      o.group.add(line)
      o.segments.push({ geometry, line })
    }

    // Remove any extra line objects.
    while (o.segments.length > segmentsWorld.length) {
      const s = o.segments.pop()!
      o.group.remove(s.line)
      s.geometry.dispose()
    }

    // Update geometry positions.
    for (let i = 0; i < segmentsWorld.length; i++) {
      o.segments[i]!.geometry.setPositions(segmentsWorld[i]!)
    }
  }

  private async sampleOrbitPositionsKm(input: {
    guide: OrbitPathsBodySpec
    anchorEtSec: number
    points: number
    signal: AbortSignal
  }): Promise<Vec3Km[][]> {
    const { minEtSec, maxEtSec } = this.bounds
    const { guide } = input
    const windowSec = Math.min(guide.spanSec, maxEtSec - minEtSec)
    const windowRatio = windowSec / (guide.periodSec ?? guide.spanSec)
    const points = Math.max(2, Math.floor(Math.max(2, input.points) * windowRatio))
    const startEt = Math.max(minEtSec, Math.min(maxEtSec - windowSec, input.anchorEtSec - windowSec * 0.5))
    const stepSec = windowSec / (points - 1)

    const segments: Vec3Km[][] = []
    let current: Vec3Km[] = []

    const finishSegment = () => {
      if (current.length >= 2) segments.push(current)
      current = []
    }

    for (let i = 0; i < points; i++) {
      if (input.signal.aborted) return []

      const et = Math.min(maxEtSec, startEt + stepSec * i)
      try {
        const state = await this.spice.kit.getState({
          target: String(guide.target),
          observer: String(guide.center),
          at: et,
          frame: this.frame,
        })
        current.push(state.position)
      } catch {
        // Best-effort: treat individual failures (kernel coverage gaps, etc.)
        // as breaks in the polyline.
        finishSegment()
      }

      // Yield occasionally so we don't block the main thread too badly on initial load.
      if (i % 16 === 15) {
        await yieldToMainThread()
      }
    }
    finishSegment()
    return segments
  }
}
