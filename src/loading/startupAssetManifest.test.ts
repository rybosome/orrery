import { describe, expect, it } from 'vitest'

import { getBodyRegistryEntry } from '../scene/BodyRegistry.js'
import {
  STARTUP_ASSET_REQUIRED_POLICY_V1,
  buildStartupAssetManifestFromBodyRegistryEntries,
  buildStartupAssetManifestFromSceneBodies,
  computeStartupAssetCompletionAccounting,
  listStartupAssetIds,
} from './startupAssetManifest.js'

describe('buildStartupAssetManifestFromBodyRegistryEntries', () => {
  it('builds deterministic body-asset lists from registry appearance metadata', () => {
    const manifest = buildStartupAssetManifestFromBodyRegistryEntries([
      getBodyRegistryEntry('MARS'),
      getBodyRegistryEntry('SATURN'),
      getBodyRegistryEntry('EARTH'),
    ])

    expect(manifest.requiredPolicy).toBe(STARTUP_ASSET_REQUIRED_POLICY_V1)
    expect(manifest.assets.every((asset) => asset.required)).toBe(true)

    expect(manifest.bodies.map((body) => body.bodyId)).toEqual(['MARS', 'SATURN', 'EARTH'])

    expect(manifest.bodies[0]?.assets.map((asset) => asset.assetKind)).toEqual([
      'surfaceMap',
      'normalMap',
      'roughnessMap',
    ])
    expect(manifest.bodies[1]?.assets.map((asset) => asset.assetKind)).toEqual(['surfaceMap', 'ringMap'])
    expect(manifest.bodies[2]?.assets.map((asset) => asset.assetKind)).toEqual([
      'surfaceMap',
      'earthNightLightsMap',
      'earthCloudsMap',
    ])

    expect(manifest.assets[0]?.assetId).toBe(
      'MARS:surfaceMap:static/textures/planets/mars-viking-colorized-4k.jpg',
    )
  })

  it('computes aggregate completion accounting with pending defaults', () => {
    const manifest = buildStartupAssetManifestFromBodyRegistryEntries([
      getBodyRegistryEntry('MARS'),
      getBodyRegistryEntry('SATURN'),
      getBodyRegistryEntry('EARTH'),
    ])

    const startupAssetIds = listStartupAssetIds(manifest)

    const accounting = computeStartupAssetCompletionAccounting(manifest, {
      completedAssetIds: [startupAssetIds[0]!, startupAssetIds[1]!, startupAssetIds[1]!, 'unknown-asset-id'],
      failedAssetIds: [startupAssetIds[2]!, 'unknown-asset-id'],
    })

    expect(accounting.total).toBe(startupAssetIds.length)
    expect(accounting.required).toBe(startupAssetIds.length)
    expect(accounting.completed).toBe(2)
    expect(accounting.failed).toBe(1)
    expect(accounting.pending).toBe(startupAssetIds.length - 3)
    expect(accounting.readinessRatio).toBeCloseTo(2 / startupAssetIds.length)
  })

  it('can resolve registry entries from scene bodies before building the manifest', () => {
    const earth = getBodyRegistryEntry('EARTH')
    const mars = getBodyRegistryEntry('MARS')

    const manifest = buildStartupAssetManifestFromSceneBodies([
      {
        body: earth.body,
        bodyFixedFrame: earth.bodyFixedFrame,
        style: earth.style,
      },
      {
        // Alias via NAIF numeric id should dedupe back to EARTH.
        body: earth.naifIds?.body ?? earth.body,
        bodyFixedFrame: earth.bodyFixedFrame,
        style: earth.style,
      },
      {
        body: mars.body,
        bodyFixedFrame: mars.bodyFixedFrame,
        style: mars.style,
      },
    ])

    expect(manifest.bodies.map((body) => body.bodyId)).toEqual(['EARTH', 'MARS'])
  })
})
