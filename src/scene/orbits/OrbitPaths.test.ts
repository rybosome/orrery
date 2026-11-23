import type { SpiceAsync } from '@rybosome/tspice'
import { describe, expect, it, vi } from 'vitest'

import type { Vec3Km } from '../../spice/types.js'
import { OrbitPaths } from './OrbitPaths.js'

describe('Sol orbit guide topology', () => {
  it('draws planet paths from the Sun and the Moon path from Earth', async () => {
    const getState = vi.fn<SpiceAsync['kit']['getState']>().mockRejectedValue(new Error('No sample in test'))
    const spice = { kit: { getState } } as unknown as SpiceAsync
    const orbits = new OrbitPaths({
      spice,
      kmToWorld: 0.5,
      bodies: [
        { body: 'SUN', color: '#fff' },
        { body: 'EARTH', color: '#fff' },
        { body: 4, color: '#fff' },
        { body: 'MOON', color: '#fff' },
      ],
    })

    try {
      orbits.update({
        etSec: 0,
        focusPosKm: [8, 0, 0],
        bodyPosKmByKey: new Map<string, Vec3Km>([
          ['SUN', [0, 0, 0]],
          ['EARTH', [12, 0, 0]],
        ]),
        bodyVisibleByKey: new Map(),
        settings: {
          lineWidthPx: 1,
          samplesPerOrbit: 2,
          maxTotalPoints: 6,
          minPointsPerOrbit: 2,
          antialias: false,
        },
      })

      expect(orbits.object.children.map((guide) => [guide.name, guide.position.x])).toEqual([
        ['OrbitPath(EARTH)', -4],
        ['OrbitPath(4)', -4],
        ['OrbitPath(MOON)', 2],
      ])
      await vi.waitFor(() => expect(getState).toHaveBeenCalledTimes(6))
      expect(getState.mock.calls.map(([query]) => [query.target, query.observer, query.frame])).toEqual([
        ['EARTH', 'SUN', 'J2000'],
        ['4', 'SUN', 'J2000'],
        ['MOON', 'EARTH', 'J2000'],
        ['EARTH', 'SUN', 'J2000'],
        ['4', 'SUN', 'J2000'],
        ['MOON', 'EARTH', 'J2000'],
      ])
    } finally {
      orbits.dispose()
    }
  })
})
