import { describe, expect, it } from 'vitest'

import { resolveSolV1Focus } from './solV1Focus.js'

describe('Sol v1 body aliases', () => {
  it('maps names, physical IDs, and barycenter IDs to stable scene IDs', () => {
    expect(['  earth  ', 399, '00399', '+00399', ' +00399 ', 3].map(resolveSolV1Focus)).toEqual(Array(6).fill('EARTH'))
    expect([4, 499, 'mars'].map(resolveSolV1Focus)).toEqual(['MARS', 'MARS', 'MARS'])
    expect([301, 'moon', 10, 'sun'].map(resolveSolV1Focus)).toEqual(['MOON', 'MOON', 'SUN', 'SUN'])
  })

  it('rejects exponent, unsafe integer, and unknown references', () => {
    expect(['3e2', '+9007199254740992', 'UNKNOWN'].map(resolveSolV1Focus)).toEqual([undefined, undefined, undefined])
  })
})
