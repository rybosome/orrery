import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { CameraController } from '../controls/CameraController.js'
import { SOLAR_SCALE_CAMERA_STATE } from './scalePresets.js'

describe('scale presets', () => {
  it('restores the authoritative Solar camera pose', () => {
    const controller = new CameraController({
      target: new THREE.Vector3(),
      radius: 1,
      yaw: 0,
      pitch: 0,
      lookYaw: 0,
      lookPitch: 0,
      lookRoll: 0,
    })
    const camera = new THREE.PerspectiveCamera()
    camera.up.set(0, 0, 1)

    controller.restore(SOLAR_SCALE_CAMERA_STATE)
    controller.applyToCamera(camera)

    expect(controller.radius).toBeCloseTo(259.5455, 3)
    expect(camera.position.x).toBeCloseTo(-99.2879, 4)
    expect(camera.position.y).toBeCloseTo(-239.3734, 4)
    expect(camera.position.z).toBeCloseTo(14.3589, 4)

    const expectedQuaternion = new THREE.Quaternion(0.674, -0.134, -0.142, 0.712).normalize()
    expect(camera.quaternion.angleTo(expectedQuaternion)).toBeCloseTo(0, 3)

    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'XYZ')
    expect(THREE.MathUtils.radToDeg(euler.x)).toBeCloseTo(86.6, 1)
    expect(THREE.MathUtils.radToDeg(euler.y)).toBeCloseTo(-22.5, 1)
    expect(THREE.MathUtils.radToDeg(euler.z)).toBeCloseTo(-1.3, 1)
  })
})
