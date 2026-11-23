import * as THREE from 'three'

import { CameraController, type CameraControllerState } from '../controls/CameraController.js'

/**
 * Authoritative Solar scale camera pose, in world coordinates.
 *
 * Keep this as a pose rather than hand-maintained controller angles so the
 * requested position and quaternion remain the source of truth.
 */
export const SOLAR_SCALE_CAMERA_STATE: CameraControllerState = CameraController.stateFromPose({
  position: new THREE.Vector3(-99.2879, -239.3734, 14.3589),
  quaternion: new THREE.Quaternion(0.674, -0.134, -0.142, 0.712),
  target: new THREE.Vector3(0, 0, 0),
})
