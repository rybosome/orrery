import * as THREE from 'three'
import { CameraController, type CameraControllerState } from '../controls/CameraController.js'

const solHomePoses = {
  MERCURY: CameraController.stateFromPose({
    // Distance-to-target: 0.0256
    position: new THREE.Vector3(0.00448183711556181, -0.02003644828133515, -0.01529097368838735),
    quaternion: new THREE.Quaternion(0.889, 0.095, 0.048, 0.446),
    target: new THREE.Vector3(0, 0, 0),
  }),
  VENUS: CameraController.stateFromPose({
    position: new THREE.Vector3(-0.0342, 0.022, 0.0062),
    quaternion: new THREE.Quaternion(-0.312, 0.572, 0.666, -0.363),
    target: new THREE.Vector3(0, 0, 0),
  }),
  EARTH: CameraController.stateFromPose({
    position: new THREE.Vector3(0.0137, 0.0294, 0.0095),
    quaternion: new THREE.Quaternion(0.13, 0.585, 0.782, 0.174),
    target: new THREE.Vector3(0, 0, 0),
  }),
  MOON: CameraController.stateFromPose({
    position: new THREE.Vector3(-0.0095, -0.0013, -0.0008),
    quaternion: new THREE.Quaternion(0.604, -0.419, -0.386, 0.557),
    target: new THREE.Vector3(0, 0, 0),
  }),
  MARS: CameraController.stateFromPose({
    position: new THREE.Vector3(0.018, 0.0093, -0.0026),
    quaternion: new THREE.Quaternion(0.357, 0.671, 0.574, 0.305),
    target: new THREE.Vector3(0, 0, 0),
  }),
  JUPITER: CameraController.stateFromPose({
    // Distance-to-target: 0.2352
    position: new THREE.Vector3(0.2163396716510539, 0.08646641772249185, 0.03224507832450929),
    quaternion: new THREE.Quaternion(0.368, 0.544, 0.624, 0.423),
    target: new THREE.Vector3(0, 0, 0),
  }),
  SATURN: CameraController.stateFromPose({
    // Distance-to-target: 0.2184
    position: new THREE.Vector3(0.20246366553742295, 0.0797819429874217, 0.018489610874822184),
    quaternion: new THREE.Quaternion(0.326, 0.584, 0.649, 0.362),
    target: new THREE.Vector3(0, 0, 0),
  }),
  URANUS: CameraController.stateFromPose({
    // Distance-to-target: 0.1506
    position: new THREE.Vector3(0.05077796103776682, -0.1183334355178367, -0.07809709797036651),
    quaternion: new THREE.Quaternion(0.854, 0.175, 0.099, 0.481),
    target: new THREE.Vector3(0, 0, 0),
  }),
  NEPTUNE: CameraController.stateFromPose({
    position: new THREE.Vector3(0.1209, -0.0394, -0.0345),
    quaternion: new THREE.Quaternion(0.643, 0.467, 0.357, 0.492),
    target: new THREE.Vector3(0, 0, 0),
  }),
} satisfies Record<string, CameraControllerState>

/** Sol home poses in world units, with each target at the rebased origin. */
export const SOL_HOME_POSES: ReadonlyMap<string, CameraControllerState> = new Map(Object.entries(solHomePoses))
