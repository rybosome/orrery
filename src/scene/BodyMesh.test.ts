import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { createBodyMesh } from './BodyMesh.js'

vi.mock('./loadTextureCached.js', () => ({
  isTextureCacheClearedError: () => false,
  loadTextureCached: async () => {
    const texture = new THREE.Texture()
    return { texture, release: () => texture.dispose() }
  },
}))

describe('body appearance', () => {
  it('applies opt-in cloud and limb shells to any body ID and aligns a fixed cloud map with the surface', async () => {
    const body = createBodyMesh({
      bodyId: 'EXAMPLE-B',
      appearance: {
        surface: { color: '#957c65' },
        textureLongitudeOffsetRad: Math.PI / 2,
        clouds: { textureUrl: 'cloud-mask.png', driftRadPerSec: 0 },
        layers: [{ kind: 'atmosphere', atmosphere: { radiusRatio: 1.03 } }],
      },
    })
    const unaligned = createBodyMesh({ bodyId: 'EARTH', appearance: { surface: { color: '#957c65' } } })
    try {
      await body.ready
      const [limb, cloud] = body.mesh.children as THREE.Mesh[]
      expect(limb.scale.x).toBeCloseTo(1.03)
      expect(cloud.scale.x).toBeCloseTo(1.01)
      expect(cloud.material).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect((cloud.material as THREE.MeshStandardMaterial).alphaMap).toBeInstanceOf(THREE.Texture)
      expect(unaligned.mesh.children).toHaveLength(0)

      const vertex = 500
      const alignedSurface = new THREE.Vector3().fromBufferAttribute(body.mesh.geometry.attributes.position, vertex)
      const alignedCloud = new THREE.Vector3().fromBufferAttribute(cloud.geometry.attributes.position, vertex)
      const original = new THREE.Vector3().fromBufferAttribute(unaligned.mesh.geometry.attributes.position, vertex)
      expect(alignedSurface.distanceTo(alignedCloud)).toBeLessThan(1e-6)
      expect(alignedSurface.distanceTo(original.applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2))).toBeLessThan(
        1e-6,
      )
      body.update?.({ etSec: 10_000, sunDirWorld: new THREE.Vector3(1, 0, 0) })
      expect(cloud.rotation.z).toBe(0)
    } finally {
      body.dispose()
      unaligned.dispose()
    }
  })

  it('configures surface emission independently of texture and body ID', () => {
    const body = createBodyMesh({
      bodyId: 'EXAMPLE-STAR',
      appearance: { surface: { color: '#fff' }, emission: { color: '#cc3311', intensity: 3 } },
    })
    expect(body.mesh.material.emissive.getHexString()).toBe('cc3311')
    expect(body.mesh.material.emissiveIntensity).toBe(3)
    body.dispose()
  })
})
