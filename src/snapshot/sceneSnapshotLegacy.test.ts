import { describe, expect, it } from 'vitest'

import { V1_MARS_VIEW_PAYLOAD, V1_SPARSE_EARTH_VIEW_PAYLOAD } from './fixtures/v1SolViews.js'
import { decodeSnapshot } from './sceneSnapshotCodec.js'

describe('legacy Sol snapshot payloads', () => {
  it('restores an authored v1 Mars view', () => {
    expect(decodeSnapshot(V1_MARS_VIEW_PAYLOAD)).toMatchObject({
      ok: true,
      snapshot: {
        v: 1,
        focusBody: 4,
        camera: {
          target: [0.02, -0.03, 0.01],
          radius: 0.4,
          yaw: 1.25,
          pitch: -0.3,
          lookYaw: 0.1,
          lookPitch: 0.2,
          lookRoll: -0.05,
        },
        player: {
          etSec: 1_234_567,
          rateSecPerSec: 0,
          quantumSec: 1,
          stepSec: 60,
          scrubMinEtSec: 0,
          scrubMaxEtSec: 10_000_000,
          playing: false,
          direction: 'paused',
        },
        scale: { cameraFovDeg: 55, sunScaleMultiplier: 3, planetScaleMultiplier: 24 },
        guides: { labelsEnabled: true },
        system: { animatedSky: false, showRenderHud: true },
        rendering: {
          ambientLightIntensity: 0.3,
          sunLightIntensity: 2.2,
          sunEmissiveColor: '#ffbb55',
          sunPostprocessToneMap: 'filmic',
          sunPostprocessBloomStrength: 0.13,
        },
      },
    })
  })

  it('uses the original v1 defaults and normalization for an incomplete view', () => {
    expect(decodeSnapshot(V1_SPARSE_EARTH_VIEW_PAYLOAD)).toMatchObject({
      ok: true,
      snapshot: {
        v: 1,
        focusBody: '+00399',
        player: {
          etSec: 4_000,
          rateSecPerSec: -60,
          quantumSec: 0.1,
          stepSec: 60,
          scrubMinEtSec: 0,
          scrubMaxEtSec: 315_576_000,
          playing: true,
          direction: 'reverse',
        },
        scale: { cameraFovDeg: 50, sunScaleMultiplier: 1, planetScaleMultiplier: 1 },
        guides: { labelsEnabled: false },
        system: { animatedSky: true, showRenderHud: false },
        rendering: {
          ambientLightIntensity: 0.45,
          sunLightIntensity: 2.1,
          sunEmissiveColor: '#ffcc55',
          sunPostprocessToneMap: 'acesLike',
          sunPostprocessBloomStrength: 0.15,
        },
      },
    })
  })
})
