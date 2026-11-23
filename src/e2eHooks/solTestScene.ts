import type { SceneDefinition } from '../scenes/sceneDefinition.js'
import { SOL_SCENE } from '../scenes/sol.js'

/** A short-coverage geometry fixture backed by the real Sol kernels. */
export function createSolTestScene(): SceneDefinition {
  const earth = SOL_SCENE.bodies.find((body) => body.id === 'EARTH')
  const sun = SOL_SCENE.bodies.find((body) => body.id === 'SUN')
  const mars = SOL_SCENE.bodies.find((body) => body.id === 'MARS')
  if (!sun || !earth || !mars) throw new Error('The Sol lighting fixture requires the Sun, Earth, and Mars')

  return {
    ...SOL_SCENE,
    id: 'sol-test-geometry',
    coordinates: { ...SOL_SCENE.coordinates, observer: 'EARTH' },
    bodies: [
      sun,
      {
        ...earth,
        id: 'REFERENCE_PLANET',
        style: {
          ...earth.style,
          appearance: { surface: { color: '#b2b2b2', roughness: 1, nightAlbedo: 0.15, terminatorTwilight: 0.08 } },
        },
      },
      mars,
    ],
    time: { ...SOL_SCENE.time, minUtc: '2000-01-01T12:00:00Z', maxUtc: '2000-01-17T00:00:00Z' },
    viewer: {
      ...SOL_SCENE.viewer,
      initialFocusId: 'REFERENCE_PLANET',
      homePoses: new Map(),
      scalePresets: {
        ...SOL_SCENE.viewer.scalePresets,
        planetary: { ...SOL_SCENE.viewer.scalePresets.planetary, focusId: 'REFERENCE_PLANET' },
      },
    },
  }
}
