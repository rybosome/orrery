import { describe, expect, it } from 'vitest'

import { createSceneCatalog, DEFAULT_SCENE, getSceneDefinition } from './sceneCatalog.js'
import { validateSceneDefinition, type SceneDefinition } from './sceneDefinition.js'
import { SOL_SCENE } from './sol.js'

describe('authored scene definitions', () => {
  it('registers Sol and leaves future scenes unavailable', () => {
    expect(getSceneDefinition('sol')).toBe(DEFAULT_SCENE)
    expect(getSceneDefinition('trappist-1')).toBeUndefined()
    expect(() => createSceneCatalog([SOL_SCENE, SOL_SCENE])).toThrow('Duplicate scene ID')
  })

  it('keeps physical body IDs, SPICE targets, and frames distinct', () => {
    expect(SOL_SCENE.bodies.find((body) => body.id === 'JUPITER')).toMatchObject({
      body: 5,
      naifIds: { body: 599 },
      bodyFixedFrame: 'IAU_JUPITER',
      style: { label: 'Jupiter' },
    })
  })

  it('rejects duplicate body IDs and dangling references', () => {
    expect(() => validateSceneDefinition({ ...SOL_SCENE, bodies: [...SOL_SCENE.bodies, SOL_SCENE.bodies[0]] })).toThrow(
      'duplicate body ID',
    )
    expect(() =>
      validateSceneDefinition({ ...SOL_SCENE, viewer: { ...SOL_SCENE.viewer, initialFocusId: 'MISSING' } }),
    ).toThrow('Initial focus')
    expect(() =>
      validateSceneDefinition({ ...SOL_SCENE, primaryLight: { ...SOL_SCENE.primaryLight, bodyId: 'EARTH' } }),
    ).toThrow('only star')
  })

  it('rejects invalid timing, orbit sampling, and duplicate kernel paths', () => {
    expect(() => validateSceneDefinition({ ...SOL_SCENE, time: { ...SOL_SCENE.time, quantumSec: 0 } })).toThrow(
      'Invalid time bounds or step settings',
    )
    const sampledBody: SceneDefinition['bodies'][number] = {
      ...SOL_SCENE.bodies[0],
      orbitGuide: { center: 'SUN', spanSec: 30, resampleEverySec: Infinity },
    }
    expect(() =>
      validateSceneDefinition({ ...SOL_SCENE, bodies: [sampledBody, ...SOL_SCENE.bodies.slice(1)] }),
    ).toThrow('Invalid orbit guide sampling')
    const kernels = SOL_SCENE.kernelPack.kernels
    expect(() => validateSceneDefinition({ ...SOL_SCENE, kernelPack: { kernels: [...kernels, kernels[0]] } })).toThrow(
      'duplicate kernel path',
    )
  })
})
