import * as THREE from 'three'
import type { SpiceAsync, StateVector } from '@rybosome/tspice'

import { computeOrbitAnglesToKeepPointInView, isDirectionWithinFov } from '../../controls/sunFocus.js'
import { createSpiceClient } from '../../spice/createSpiceClient.js'
import type { EtSeconds, Mat3, Vec3Km } from '../../spice/types.js'
import { createBodyMesh } from '../BodyMesh.js'
import { SUN_BLOOM_LAYER } from '../../renderLayers.js'
import { computeBodyRadiusWorld } from '../bodyScaling.js'
import { createFrameAxes, mat3ToMatrix4 } from '../FrameAxes.js'
import { OrbitPaths } from '../orbits/OrbitPaths.js'
import { rebasePositionKm } from '../precision.js'
import type { SceneDefinition } from '../../scenes/sceneDefinition.js'
import { LabelOverlay, type LabelBody, type LabelOverlayUpdateOptions } from '../../labels/LabelOverlay.js'
import type { TimeStore } from '../../time/timeStore.js'
import { computeViewerScrubRangeEt } from '../../time/viewerTimeBounds.js'
import { installTspiceViewerE2eApi } from '../../e2eHooks/index.js'
import type { CameraController, CameraControllerState } from '../../controls/CameraController.js'
import { shouldAutoZoomOnFocusChange } from './focusAutoZoom.js'
import { createSceneResources } from './sceneResources.js'

export type SceneUiState = {
  etSec: EtSeconds
  focusBody: string
  showJ2000Axes: boolean
  showBodyFixedAxes: boolean
  cameraFovDeg: number
  sunScaleMultiplier: number
  planetScaleMultiplier: number

  orbitLineWidthPx: number
  orbitSamplesPerOrbit: number
  orbitMaxTotalPoints: number
  orbitPathsEnabled: boolean
  labelsEnabled: boolean
  labelOcclusionEnabled: boolean

  // Debug/temporary tuning knobs (ephemeral; intended for dialing in Earth appearance).
  ambientLightIntensity: number
  sunLightIntensity: number

  // Debug-only: helps the Sun read as a glowing object at distance.
  sunEmissiveIntensity: number
  sunEmissiveColor: string
}

export type SpiceSceneRuntime = {
  spice: SpiceAsync
  updateScene: (next: SceneUiState, options?: { required?: boolean }) => Promise<void>
  afterRender: () => void
  onDrawingBufferResize: (bufferSize: { width: number; height: number }) => void
  dispose: () => void
  pickables: THREE.Mesh[]
}

type SpiceSceneRuntimeOptions = {
  definition: SceneDefinition
  isE2e: boolean
  initialEt: number | null
  timeStore: TimeStore
  signal: AbortSignal

  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controller: CameraController
  container: HTMLDivElement

  /** Populated with body meshes for picking (shared with interaction + labels). */
  pickables: THREE.Mesh[]

  kmToWorld: number
  sunOcclusionMarginRad: number

  computeFocusRadius: (radiusWorld: number) => number

  cancelFocusTween: (() => void) | undefined
  focusOn: ((nextTarget: THREE.Vector3, opts?: { radius?: number; immediate?: boolean }) => void) | undefined

  /** Called during auto-focus for non-home presets. */
  resetLookOffset: (() => void) | undefined

  initialControllerStateRef: { current: CameraControllerState | null }

  /**
   * When set to a body id, the next focus change to that body will skip the
   * runtime's auto-zoom/home-preset camera overrides. This is consumed (cleared)
   * after the focus change is observed.
   */
  skipAutoZoomForNextFocusBodyRef?: { current: string | null }

  selectedBodyIdRef: { current: string | undefined }

  invalidate: () => void
}

/** Initialize SPICE and the scene objects, with cleanup on failure or cancellation. */
export async function initSpiceSceneRuntime(args: SpiceSceneRuntimeOptions): Promise<SpiceSceneRuntime> {
  const resources = createSceneResources(args.signal)
  try {
    return await buildSceneRuntime(args, resources)
  } catch (error) {
    resources.dispose()
    throw error
  }
}

async function buildSceneRuntime(
  args: SpiceSceneRuntimeOptions,
  resources: ReturnType<typeof createSceneResources>,
): Promise<SpiceSceneRuntime> {
  const {
    definition,
    isE2e,
    initialEt,
    timeStore,
    signal,
    scene,
    camera,
    controller,
    container,
    pickables,
    kmToWorld,
    sunOcclusionMarginRad,
    computeFocusRadius,
    cancelFocusTween,
    focusOn,
    resetLookOffset,
    initialControllerStateRef,
    skipAutoZoomForNextFocusBodyRef,
    selectedBodyIdRef,
    invalidate,
  } = args

  // Resource cleanup list
  const sceneObjects: THREE.Object3D[] = []
  const isDisposed = () => resources.disposed
  resources.add(() => {
    for (const object of sceneObjects) scene.remove(object)
    pickables.length = 0
  })
  signal.throwIfAborted()

  // Lighting (owned by the scene runtime)
  const ambient = new THREE.AmbientLight(0xffffff, definition.viewer.ambientLightIntensity)
  scene.add(ambient)
  sceneObjects.push(ambient)

  // A constant-intensity point source aligns standard materials with the
  // custom terminator shaders while keeping visual intensity scene-authored.
  const light = new THREE.PointLight(definition.primaryLight.color, definition.primaryLight.intensity, 0, 0)
  scene.add(light)
  sceneObjects.push(light)

  const { spice: cachedSpice, dispose: disposeSpice } = await createSpiceClient(definition.kernelPack)

  resources.add(disposeSpice)
  signal.throwIfAborted()

  const bounds = await computeViewerScrubRangeEt({ spice: cachedSpice, time: definition.time })
  signal.throwIfAborted()
  timeStore.initializeBounds(bounds, initialEt ?? definition.time.initialEtSec)
  resources.add(installTspiceViewerE2eApi({ isE2e, spice: cachedSpice }))

  const { frame, observer } = definition.coordinates
  const starId = definition.primaryLight.bodyId
  const observerKey = String(observer)
  const bodies = definition.bodies.map((body) => {
    const bodyId = body.id

    const { mesh, dispose, ready, update } = createBodyMesh({
      bodyId,
      appearance: body.style.appearance,
    })

    mesh.userData.bodyId = bodyId
    // Store radiusKm for dynamic scale updates
    mesh.userData.radiusKm = body.style.radiusKm

    if (body.style.appearance.emission?.bloom) {
      mesh.layers.enable(SUN_BLOOM_LAYER)
    }

    pickables.push(mesh)
    sceneObjects.push(mesh)
    resources.add(dispose)
    scene.add(mesh)

    const axes = !isE2e && body.bodyFixedFrame ? createFrameAxes({ sizeWorld: 0.45, opacity: 0.9 }) : undefined

    if (axes) {
      axes.object.visible = false
      sceneObjects.push(axes.object)
      resources.add(axes.dispose)
      scene.add(axes.object)
    }

    return {
      body: body.body,
      bodyId,
      label: body.style.label ?? body.id,
      kind: body.kind,
      hasEmission: Boolean(body.style.appearance.emission),
      bodyFixedFrame: body.bodyFixedFrame,
      radiusKm: body.style.radiusKm,
      mesh,
      axes,
      update,
      ready,

      // Populated on-demand by the async SPICE update pipeline.
      lastState: undefined as StateVector | undefined,
      lastBodyFixedRotation: undefined as Mat3 | undefined,
    }
  })

  const bodiesById = new Map(bodies.map((body) => [body.bodyId, body]))
  const star = bodiesById.get(starId)
  const sunMaterial = star?.hasEmission ? star.mesh.material : undefined

  // Ensure textures are loaded before we mark the scene as rendered.
  await Promise.all(bodies.map((b) => b.ready))

  signal.throwIfAborted()

  const guides = definition.bodies.flatMap((body) =>
    body.orbitGuide
      ? [
          {
            id: body.id,
            target: body.body,
            color: body.style.appearance.surface.color,
            ...body.orbitGuide,
          },
        ]
      : [],
  )
  const orbitPaths = new OrbitPaths({ spice: cachedSpice, kmToWorld, frame, bounds, guides, invalidate })
  const renderTargets = new Set(bodies.map((body) => String(body.body)))
  const hiddenCenterKeys = [...new Set(guides.map((guide) => String(guide.center)))].filter(
    (key) => key !== observerKey && !renderTargets.has(key),
  )
  let hiddenCenterSample: { etSec: EtSeconds; positions: Promise<Array<readonly [string, Vec3Km] | null>> } | undefined

  sceneObjects.push(orbitPaths.object)
  resources.add(() => orbitPaths.dispose())
  scene.add(orbitPaths.object)

  const j2000Axes = !isE2e ? createFrameAxes({ sizeWorld: 1.2, opacity: 0.9 }) : undefined
  if (j2000Axes) {
    j2000Axes.object.visible = false
    sceneObjects.push(j2000Axes.object)
    resources.add(j2000Axes.dispose)
    scene.add(j2000Axes.object)
  }

  // Label overlay (only in interactive mode)
  let labelOverlay: LabelOverlay | null = null
  if (!isE2e) {
    labelOverlay = new LabelOverlay({
      container,
      camera,
      kmToWorld,
    })

    resources.add(() => {
      labelOverlay?.dispose()
      labelOverlay = null
    })
  }

  let latestLabelOverlayOptions: LabelOverlayUpdateOptions | null = null

  const afterRender = () => {
    if (labelOverlay && latestLabelOverlayOptions) {
      // Keep selection in sync even when simulation time is paused.
      labelOverlay.update({
        ...latestLabelOverlayOptions,
        selectedBodyId: selectedBodyIdRef.current,
      })
    }
  }

  const labelBodies: LabelBody[] = bodies.map((b) => ({
    id: b.bodyId,
    label: b.label,
    kind: b.kind,
    mesh: b.mesh,
    radiusKm: b.radiusKm,
  }))
  let lastAutoZoomFocusBody: string | undefined

  // ---------------------------------------------------------------------------
  // SPICE cache
  // ---------------------------------------------------------------------------
  // Cache the most recent "absolute" body states for the current ET, so:
  // - focus changes can be applied synchronously (important for e2e camera presets)
  // - we don't refetch the entire scene's state for UI-only updates
  let cachedEtSec: EtSeconds | undefined
  let spiceSampleToken = 0
  let sceneUpdateToken = 0

  const ensureSpiceSample = async (etSec: EtSeconds): Promise<void> => {
    if (cachedEtSec === etSec && bodies.every((b) => b.lastState)) return

    const token = ++spiceSampleToken

    const statePromises = bodies.map((b) =>
      cachedSpice.kit.getState({
        target: String(b.body),
        observer: observerKey,
        at: etSec,
        frame,
      }),
    )

    const rotationPromises = bodies.map((b) =>
      b.bodyFixedFrame
        ? cachedSpice.kit.frameTransform(b.bodyFixedFrame, frame, etSec).then((m) => m.toColMajor())
        : Promise.resolve(undefined),
    )

    const [states, rotations] = await Promise.all([Promise.all(statePromises), Promise.all(rotationPromises)])

    if (isDisposed()) return
    if (token !== spiceSampleToken) return

    cachedEtSec = etSec

    for (let i = 0; i < bodies.length; i++) {
      bodies[i]!.lastState = states[i]
      bodies[i]!.lastBodyFixedRotation = rotations[i]
    }
  }

  const centerPositions = new Map<string, Vec3Km>()
  const bodyVisibility = new Map<string, boolean>()

  const ORBIT_MIN_POINTS_PER_ORBIT = 32

  const updateScene: SpiceSceneRuntime['updateScene'] = async (next, { required = false } = {}) => {
    const token = ++sceneUpdateToken

    try {
      if (isDisposed()) return

      // Lighting knobs
      ambient.intensity = next.ambientLightIntensity
      light.intensity = next.sunLightIntensity

      // Sun glow tuning.
      if (sunMaterial) {
        const intensity = THREE.MathUtils.clamp(next.sunEmissiveIntensity, 0, 50)
        sunMaterial.emissive.set(next.sunEmissiveColor)
        sunMaterial.emissiveIntensity = intensity
      }

      // Only refetch SPICE if ET changes.
      if (cachedEtSec !== next.etSec || bodies.some((b) => !b.lastState)) {
        await ensureSpiceSample(next.etSec)
        if (isDisposed()) return
        if (token !== sceneUpdateToken) return
      }

      const skipAutoZoomForFocusBody = skipAutoZoomForNextFocusBodyRef?.current ?? null

      const shouldSkipAutoZoomForFocusBody =
        skipAutoZoomForFocusBody != null &&
        String(skipAutoZoomForFocusBody) === String(next.focusBody) &&
        String(next.focusBody) !== String(lastAutoZoomFocusBody)

      // `shouldSkipAutoZoomForFocusBody` is meant to be a one-shot override.
      // Keep it mutually exclusive with any later auto-zoom + home-preset logic
      // so we don't accidentally override the caller-preserved radius.
      const shouldAutoZoomThisTick =
        !shouldSkipAutoZoomForFocusBody &&
        shouldAutoZoomOnFocusChange({
          isE2e,
          nextFocusBody: next.focusBody,
          lastAutoZoomFocusBody,
          skipAutoZoomForFocusBody,
        })

      const homePreset = shouldAutoZoomThisTick ? definition.viewer.homePoses.get(next.focusBody) : undefined

      if (shouldSkipAutoZoomForFocusBody) {
        cancelFocusTween?.()

        // Keep the caller-selected camera state, including free-look offsets,
        // but force the camera target to the rebased origin for the new focus body.
        focusOn?.(new THREE.Vector3(0, 0, 0), {
          radius: controller.radius,
          immediate: true,
        })

        if (!initialControllerStateRef.current) {
          initialControllerStateRef.current = controller.snapshot()
        }

        lastAutoZoomFocusBody = next.focusBody
        if (skipAutoZoomForNextFocusBodyRef) skipAutoZoomForNextFocusBodyRef.current = null
      } else if (shouldAutoZoomThisTick) {
        cancelFocusTween?.()

        // Clear look offset when auto-focusing a new body.
        // Home presets supply their own look offset, so don't wipe it.
        if (!homePreset) {
          resetLookOffset?.()
        }
      }

      const focusBodyMeta = bodiesById.get(next.focusBody)
      const focusPosKm = focusBodyMeta?.lastState?.position
      const starPosKm = star?.lastState?.position
      if (!focusPosKm || !starPosKm) throw new Error(`Scene position missing for "${next.focusBody}" or "${starId}"`)
      const sunDirKm = rebasePositionKm(starPosKm, focusPosKm)

      if (shouldAutoZoomThisTick) {
        // Home preset beats the normal auto-zoom + sun-in-view heuristics.
        if (homePreset) {
          controller.restore(homePreset)
          controller.applyToCamera(camera)

          // Capture the initial camera view (after first focus logic runs)
          // so keyboard Reset (R) can return exactly to the page-load view.
          if (!initialControllerStateRef.current) {
            initialControllerStateRef.current = controller.snapshot()
          }

          lastAutoZoomFocusBody = next.focusBody
        } else {
          if (focusBodyMeta) {
            let radiusWorld = computeBodyRadiusWorld({
              radiusKm: focusBodyMeta.radiusKm,
              kmToWorld,
              mode: 'true',
            })

            // Match the rendered size when auto-zooming.
            radiusWorld *= String(next.focusBody) === starId ? next.sunScaleMultiplier : next.planetScaleMultiplier

            const nextRadius = computeFocusRadius(radiusWorld)

            // When focusing a non-Sun body, bias the camera orientation so the
            // Sun remains visible (it provides important spatial context).
            if (String(next.focusBody) !== starId) {
              const sunPosWorld = new THREE.Vector3(
                sunDirKm[0] * kmToWorld,
                sunDirKm[1] * kmToWorld,
                sunDirKm[2] * kmToWorld,
              )

              if (sunPosWorld.lengthSq() > 1e-12) {
                const sunDir = sunPosWorld.clone().normalize()

                // Current forward direction (camera -> target) derived from the
                // controller's yaw/pitch (target/radius don't affect direction).
                const cosPitch = Math.cos(controller.pitch)
                const currentOffsetDir = new THREE.Vector3(
                  cosPitch * Math.cos(controller.yaw),
                  cosPitch * Math.sin(controller.yaw),
                  Math.sin(controller.pitch),
                )
                const currentForwardDir = currentOffsetDir.multiplyScalar(-1).normalize()

                // Use the same angular margin for both frustum checks and for
                // ensuring the Sun isn't hidden behind the focused body.
                const marginRad = sunOcclusionMarginRad

                // If the Sun is too close to the view center, it can be
                // completely occluded by the focused body (which is centered
                // at the camera target). So we require the Sun to be separated
                // from center by more than the body's angular radius.
                const bodyAngRad = Math.asin(THREE.MathUtils.clamp(radiusWorld / nextRadius, 0, 1))
                const minSeparationRad = bodyAngRad + marginRad

                const sunAngle = currentForwardDir.angleTo(sunDir)
                const sunInFov = isDirectionWithinFov({
                  cameraForwardDir: currentForwardDir,
                  dirToPoint: sunDir,
                  cameraFovDeg: next.cameraFovDeg,
                  cameraAspect: camera.aspect,
                  marginRad,
                })
                const sunNotOccluded = sunAngle >= minSeparationRad

                if (!sunInFov || !sunNotOccluded) {
                  const angles = computeOrbitAnglesToKeepPointInView({
                    pointWorld: sunPosWorld,
                    cameraFovDeg: next.cameraFovDeg,
                    cameraAspect: camera.aspect,
                    desiredOffAxisRad: minSeparationRad,
                    marginRad,
                  })

                  if (angles) {
                    controller.yaw = angles.yaw
                    controller.pitch = angles.pitch
                  }
                }
              }
            }

            // For focus-body selection (dropdown), force the camera to look at
            // the rebased origin and update radius immediately.
            focusOn?.(new THREE.Vector3(0, 0, 0), {
              radius: nextRadius,
              immediate: true,
            })

            // Capture the initial camera view (after first focus logic runs)
            // so keyboard Reset (R) can return exactly to the page-load view.
            if (!initialControllerStateRef.current) {
              initialControllerStateRef.current = controller.snapshot()
            }
          }

          lastAutoZoomFocusBody = next.focusBody
        }
      }

      centerPositions.clear()
      centerPositions.set(observerKey, [0, 0, 0])
      if (next.orbitPathsEnabled && hiddenCenterKeys.length) {
        if (hiddenCenterSample?.etSec !== next.etSec) {
          const positions = Promise.all(
            hiddenCenterKeys.map(async (center) => {
              try {
                const state = await cachedSpice.kit.getState({
                  target: center,
                  observer: observerKey,
                  at: next.etSec,
                  frame,
                })
                return [center, state.position] as const
              } catch (error) {
                if (!isDisposed()) console.warn('Orbit guide center unavailable', center, error)
                return null
              }
            }),
          )
          hiddenCenterSample = { etSec: next.etSec, positions }
        }
        const positions = await hiddenCenterSample.positions
        if (isDisposed() || token !== sceneUpdateToken) return
        for (const entry of positions) {
          if (entry) centerPositions.set(...entry)
        }
      }
      bodyVisibility.clear()

      for (const b of bodies) {
        const state = b.lastState
        if (!state) continue

        centerPositions.set(String(b.body), state.position)
        bodyVisibility.set(b.bodyId, b.mesh.visible)

        const rebasedKm = rebasePositionKm(state.position, focusPosKm)
        b.mesh.position.set(rebasedKm[0] * kmToWorld, rebasedKm[1] * kmToWorld, rebasedKm[2] * kmToWorld)

        // Update mesh scale (true scaling)
        let radiusWorld = computeBodyRadiusWorld({
          radiusKm: b.radiusKm,
          kmToWorld,
          mode: 'true',
        })

        // Apply Sun scale multiplier (Sun only)
        if (b.bodyId === starId) {
          radiusWorld *= next.sunScaleMultiplier
        } else {
          radiusWorld *= next.planetScaleMultiplier
        }

        b.mesh.scale.setScalar(radiusWorld)

        const bodyFixedRotation = b.bodyFixedFrame ? b.lastBodyFixedRotation : undefined

        // Apply the body-fixed frame orientation to the mesh so textures
        // rotate with the body.
        if (bodyFixedRotation) {
          b.mesh.setRotationFromMatrix(mat3ToMatrix4(bodyFixedRotation))
        }

        if (b.axes) {
          const visible = next.showBodyFixedAxes && Boolean(b.bodyFixedFrame)
          b.axes.object.visible = visible

          if (visible && b.bodyFixedFrame) {
            b.axes.setPose({ position: b.mesh.position, rotationJ2000: bodyFixedRotation })
          }
        }
      }

      // Update orbit paths after primary/body positions are known.
      if (orbitPaths) {
        orbitPaths.object.visible = next.orbitPathsEnabled
        if (next.orbitPathsEnabled) {
          orbitPaths.update({
            etSec: next.etSec,
            focusPosKm,
            centerPositions,
            bodyVisibility,
            settings: {
              lineWidthPx: next.orbitLineWidthPx,
              samplesPerOrbit: next.orbitSamplesPerOrbit,
              maxTotalPoints: next.orbitMaxTotalPoints,
              minPointsPerOrbit: ORBIT_MIN_POINTS_PER_ORBIT,
              antialias: true,
            },
          })
        }
      }

      if (j2000Axes) {
        j2000Axes.object.visible = next.showJ2000Axes
        if (next.showJ2000Axes) {
          j2000Axes.setPose({ position: new THREE.Vector3(0, 0, 0) })
        }
      }

      light.position.set(...sunDirKm).multiplyScalar(kmToWorld)
      const direction = new THREE.Vector3()
      for (const body of bodies) {
        if (!body.update || !body.lastState) continue
        direction.set(...rebasePositionKm(starPosKm, body.lastState.position)).normalize()
        body.update({ sunDirWorld: direction, etSec: next.etSec })
      }

      // Record label overlay inputs so we can update it on camera movement.
      latestLabelOverlayOptions = {
        bodies: labelBodies,
        focusBodyId: next.focusBody,
        selectedBodyId: selectedBodyIdRef.current,
        labelsEnabled: next.labelsEnabled,
        occlusionEnabled: next.labelOcclusionEnabled,
        pickables,
        sunScaleMultiplier: next.sunScaleMultiplier,
        planetScaleMultiplier: next.planetScaleMultiplier,
      }

      invalidate()
    } catch (err) {
      if (isDisposed()) return
      if (required) throw err
      console.warn('Scene update failed', err)
    }
  }

  const onDrawingBufferResize = ({ width, height }: { width: number; height: number }) => {
    orbitPaths?.setResolution(width, height)
  }

  resources.add(() => {
    latestLabelOverlayOptions = null
  })

  return {
    spice: cachedSpice,
    pickables,
    updateScene,
    afterRender,
    onDrawingBufferResize,
    dispose: resources.dispose,
  }
}
