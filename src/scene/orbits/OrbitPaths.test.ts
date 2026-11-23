import type { SpiceAsync } from '@rybosome/tspice'
import { describe, expect, it, vi } from 'vitest'

import { SOL_SCENE } from '../../scenes/sol.js'
import { OrbitPaths } from './OrbitPaths.js'

describe('scene orbit guides', () => {
  it('declares heliocentric Sol planet guides and an Earth-centered lunar guide', () => {
    expect(SOL_SCENE.bodies.map(({ id, orbitGuide }) => [id, orbitGuide?.center])).toEqual([
      ['SUN', undefined],
      ['MERCURY', 'SUN'],
      ['VENUS', 'SUN'],
      ['EARTH', 'SUN'],
      ['MARS', 'SUN'],
      ['JUPITER', 'SUN'],
      ['SATURN', 'SUN'],
      ['URANUS', 'SUN'],
      ['NEPTUNE', 'SUN'],
      ['MOON', 'EARTH'],
    ])
  })

  it('samples a guide relative to a hidden center and keeps endpoint samples within coverage', async () => {
    const getState = vi.fn<SpiceAsync['kit']['getState']>().mockImplementation(async (query) => ({
      et: query.at,
      frame: query.frame ?? 'J2000',
      target: String(query.target),
      observer: String(query.observer),
      aberration: 'NONE',
      position: [1, 2, 3],
      velocity: [0, 0, 0],
      lightTime: 0,
    }))
    const spice = { kit: { getState } } as unknown as SpiceAsync
    const invalidate = vi.fn()
    const orbits = new OrbitPaths({
      spice,
      kmToWorld: 0.5,
      frame: 'ECLIPJ2000',
      bounds: { minEtSec: 10, maxEtSec: 20 },
      guides: [{ id: 'outer', target: 4, center: 3, spanSec: 4, resampleEverySec: 1, color: '#fff' }],
      invalidate,
    })

    try {
      const update = (etSec: number) =>
        orbits.update({
          etSec,
          focusPosKm: [8, 0, 0],
          centerPositions: new Map([['3', [12, 0, 0]]]),
          bodyVisibility: new Map(),
          settings: {
            lineWidthPx: 1,
            samplesPerOrbit: 2,
            maxTotalPoints: 2,
            minPointsPerOrbit: 2,
            antialias: false,
          },
        })
      update(10)
      await vi.waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
      update(20)
      await vi.waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2))

      expect(orbits.object.children.map((guide) => [guide.name, guide.position.x])).toEqual([['OrbitPath(outer)', 2]])
      expect(getState.mock.calls.map(([query]) => query)).toEqual(
        [10, 14, 16, 20].map((at) => ({ target: '4', observer: '3', frame: 'ECLIPJ2000', at })),
      )
    } finally {
      orbits.dispose()
    }
  })
})
