import { describe, expect, it } from 'vitest'

import { parseSceneCanvasRuntimeConfigFromLocationSearch } from './sceneCanvasRuntimeConfig.js'

describe('parseSceneCanvasRuntimeConfigFromLocationSearch', () => {
  it('uses interactive defaults when no query params are provided', () => {
    const config = parseSceneCanvasRuntimeConfigFromLocationSearch('')

    expect(config).toMatchObject({
      isE2e: false,
      enableLogDepth: false,
      starSeed: 1337,
      animatedSky: true,
      skyTwinkle: false,
      initialEt: null,
      sunPostprocessMode: 'wholeFrame',
      sunExposure: 1.5,
      sunToneMap: 'acesLike',
      sunBloomThreshold: 1.5,
      sunBloomStrength: 0.15,
      sunBloomRadius: 0.05,
      sunBloomResolutionScale: 1,
    })
  })

  it('parses retained debug/e2e params', () => {
    const config = parseSceneCanvasRuntimeConfigFromLocationSearch(
      '?e2e=1&logDepth=1&et=1234567&sunPostprocessMode=sunIsolated&sunToneMap=filmic',
    )

    expect(config).toMatchObject({
      isE2e: true,
      enableLogDepth: true,
      starSeed: 1,
      animatedSky: false,
      skyTwinkle: false,
      initialEt: 1_234_567,
      sunPostprocessMode: 'sunIsolated',
      sunToneMap: 'filmic',
    })
  })

  it('treats et and sun overrides as e2e-only', () => {
    const config = parseSceneCanvasRuntimeConfigFromLocationSearch(
      '?et=1234567&sunPostprocessMode=sunIsolated&sunToneMap=filmic',
    )

    expect(config).toMatchObject({
      isE2e: false,
      initialEt: null,
      sunPostprocessMode: 'wholeFrame',
      sunToneMap: 'acesLike',
    })
  })

  it('ignores removed legacy scene-state query params', () => {
    const config = parseSceneCanvasRuntimeConfigFromLocationSearch(
      '?e2e=1&debug=1&starSeed=42&seed=9&milkyWay=0&animatedSky=0&twinkle=1&utc=2000-01-01T00:00:00Z&sunExposure=5&sunBloomThreshold=3&sunBloomStrength=2&sunBloomRadius=0.8&sunBloomResolutionScale=0.2',
    )

    expect(config).toMatchObject({
      isE2e: true,
      starSeed: 1,
      animatedSky: false,
      skyTwinkle: false,
      initialEt: null,
      sunPostprocessMode: 'off',
      sunExposure: 1.5,
      sunToneMap: 'acesLike',
      sunBloomThreshold: 1.5,
      sunBloomStrength: 0.15,
      sunBloomRadius: 0.05,
      sunBloomResolutionScale: 1,
    })
  })
})
