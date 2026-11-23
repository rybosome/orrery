import * as THREE from 'three'

/** Sample the two hemispheres of a body using the live scene materials and lights. */
export function sampleBodyLighting({
  renderer,
  scene,
  body,
  star,
}: {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  body: THREE.Mesh
  star: THREE.Mesh
}): { dark: number; lit: number } {
  const towardLight = new THREE.Vector3().subVectors(star.position, body.position).normalize()
  const referenceUp = Math.abs(towardLight.z) < 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
  const towardCamera = new THREE.Vector3().crossVectors(towardLight, referenceUp).normalize()
  const radius = body.scale.x
  const halfWidth = 1.25 * radius
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfWidth, -halfWidth, radius, radius * 8)
  camera.up.crossVectors(towardCamera, towardLight)
  camera.position.copy(body.position).addScaledVector(towardCamera, 4 * radius)
  camera.lookAt(body.position)

  const target = new THREE.WebGLRenderTarget(64, 64)
  const previous = renderer.getRenderTarget()
  const pixels = new Uint8Array(4)
  const sample = (x: number) => {
    renderer.readRenderTargetPixels(target, x, 32, 1, 1, pixels)
    return (pixels[0] + pixels[1] + pixels[2]) / 3
  }
  try {
    renderer.setRenderTarget(target)
    renderer.clear()
    renderer.render(scene, camera)
    return { dark: sample(16), lit: sample(48) }
  } finally {
    renderer.setRenderTarget(previous)
    target.dispose()
  }
}
