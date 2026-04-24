import { deflateSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SCRUB_MAX_ET_SEC, DEFAULT_SCRUB_MIN_ET_SEC } from '../time/timeStore.js'
import { createDefaultSceneSnapshotV1 } from './sceneSnapshot.js'
import { decodeSnapshot, encodeSnapshot } from './sceneSnapshotCodec.js'

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function encodeRawPayload(value: unknown): string {
  const json = JSON.stringify(value)
  return bytesToBase64Url(deflateSync(new TextEncoder().encode(json), { level: 9 }))
}

describe('sceneSnapshotCodec', () => {
  it('produces deterministic roundtrip payloads', () => {
    const snapshot = {
      ...createDefaultSceneSnapshotV1(),
      focusBody: 'MARS',
      player: {
        ...createDefaultSceneSnapshotV1().player,
        etSec: 123.4,
        rateSecPerSec: -3600,
        playing: true,
        direction: 'reverse' as const,
      },
      scale: {
        ...createDefaultSceneSnapshotV1().scale,
        cameraFovDeg: 65,
        sunScaleMultiplier: 12,
        planetScaleMultiplier: 32,
      },
    }

    const payloadA = encodeSnapshot(snapshot)
    const payloadB = encodeSnapshot(snapshot)

    expect(payloadA).toBe(payloadB)
    expect(payloadA).toMatch(/^[A-Za-z0-9_-]+$/)

    const decoded = decodeSnapshot(payloadA)
    expect(decoded.ok).toBe(true)

    if (!decoded.ok) throw new Error('expected decode success')

    expect(encodeSnapshot(decoded.snapshot)).toBe(payloadA)
    expect(decoded.snapshot.focusBody).toBe('MARS')
    expect(decoded.snapshot.player.rateSecPerSec).toBe(-3600)
    expect(decoded.snapshot.player.direction).toBe('reverse')
    expect(decoded.snapshot.player.playing).toBe(true)
  })

  it('returns structured errors for malformed payloads', () => {
    const invalidCharacters = decodeSnapshot('@@@')
    expect(invalidCharacters.ok).toBe(false)
    if (invalidCharacters.ok) throw new Error('expected decode failure')
    expect(invalidCharacters.error.code).toBe('invalid_payload')

    const notCompressed = decodeSnapshot(bytesToBase64Url(new TextEncoder().encode('{"v":1}')))
    expect(notCompressed.ok).toBe(false)
    if (notCompressed.ok) throw new Error('expected decode failure')
    expect(notCompressed.error.code).toBe('decompression_failed')

    const notJson = decodeSnapshot(bytesToBase64Url(deflateSync(new TextEncoder().encode('not-json'), { level: 9 })))
    expect(notJson.ok).toBe(false)
    if (notJson.ok) throw new Error('expected decode failure')
    expect(notJson.error.code).toBe('invalid_json')

    const unsupportedVersion = decodeSnapshot(encodeRawPayload({ v: 2 }))
    expect(unsupportedVersion.ok).toBe(false)
    if (unsupportedVersion.ok) throw new Error('expected decode failure')
    expect(unsupportedVersion.error.code).toBe('unsupported_version')
  })

  it('normalizes and clamps decoded values', () => {
    const defaults = createDefaultSceneSnapshotV1()

    const payload = encodeRawPayload({
      v: 1,
      camera: {
        target: [1, 'bad', 3],
        radius: -10,
        yaw: 'bad',
        pitch: 999,
        lookYaw: 5,
        lookPitch: -999,
        lookRoll: 'bad',
      },
      focusBody: '',
      player: {
        etSec: 999_999_999,
        rateSecPerSec: -120,
        quantumSec: -1,
        stepSec: 0,
        scrubMinEtSec: 100,
        scrubMaxEtSec: 10,
        playing: false,
        direction: 'forward',
      },
      scale: {
        cameraFovDeg: 120,
        sunScaleMultiplier: 99,
        planetScaleMultiplier: -5,
      },
      guides: {
        showJ2000Axes: 'yes',
        showBodyFixedAxes: true,
        labelsEnabled: 1,
        labelOcclusionEnabled: true,
      },
      orbitPaths: {
        enabled: 'yes',
        lineWidthPx: 100,
        samplesPerOrbit: 77,
        maxTotalPoints: 10,
      },
      system: {
        animatedSky: false,
        skyTwinkle: 'yes',
        showRenderHud: true,
      },
      rendering: {
        ambientLightIntensity: -1,
        sunLightIntensity: 99,
        sunEmissiveIntensity: 99,
        sunEmissiveColor: 'purple',
        sunPostprocessExposure: 100,
        sunPostprocessToneMap: 'strange',
        sunPostprocessBloomThreshold: 99,
        sunPostprocessBloomStrength: 99,
        sunPostprocessBloomRadius: -5,
        sunPostprocessBloomResolutionScale: 0,
      },
    })

    const decoded = decodeSnapshot(payload)
    expect(decoded.ok).toBe(true)

    if (!decoded.ok) throw new Error('expected decode success')

    expect(decoded.snapshot.focusBody).toBe(defaults.focusBody)

    expect(decoded.snapshot.camera.target).toEqual([1, defaults.camera.target[1], 3])
    expect(decoded.snapshot.camera.radius).toBe(0.001)
    expect(decoded.snapshot.camera.yaw).toBe(defaults.camera.yaw)
    expect(decoded.snapshot.camera.pitch).toBeCloseTo(Math.PI / 2 - 0.01)
    expect(decoded.snapshot.camera.lookPitch).toBeCloseTo(-(Math.PI / 2 - 0.01))
    expect(decoded.snapshot.camera.lookRoll).toBe(defaults.camera.lookRoll)

    expect(decoded.snapshot.player.quantumSec).toBe(0.001)
    expect(decoded.snapshot.player.stepSec).toBe(0.001)
    expect(decoded.snapshot.player.scrubMinEtSec).toBe(DEFAULT_SCRUB_MIN_ET_SEC)
    expect(decoded.snapshot.player.scrubMaxEtSec).toBe(DEFAULT_SCRUB_MAX_ET_SEC)
    expect(decoded.snapshot.player.etSec).toBe(DEFAULT_SCRUB_MAX_ET_SEC)
    expect(decoded.snapshot.player.direction).toBe('reverse')
    expect(decoded.snapshot.player.playing).toBe(true)

    expect(decoded.snapshot.scale.cameraFovDeg).toBe(90)
    expect(decoded.snapshot.scale.sunScaleMultiplier).toBe(20)
    expect(decoded.snapshot.scale.planetScaleMultiplier).toBe(1)

    expect(decoded.snapshot.guides.showJ2000Axes).toBe(false)
    expect(decoded.snapshot.guides.showBodyFixedAxes).toBe(true)
    expect(decoded.snapshot.guides.labelsEnabled).toBe(false)
    expect(decoded.snapshot.guides.labelOcclusionEnabled).toBe(true)

    expect(decoded.snapshot.orbitPaths.enabled).toBe(false)
    expect(decoded.snapshot.orbitPaths.lineWidthPx).toBe(10)
    expect(decoded.snapshot.orbitPaths.samplesPerOrbit).toBe(64)
    expect(decoded.snapshot.orbitPaths.maxTotalPoints).toBe(256)

    expect(decoded.snapshot.system.animatedSky).toBe(false)
    expect(decoded.snapshot.system.skyTwinkle).toBe(false)
    expect(decoded.snapshot.system.showRenderHud).toBe(true)

    expect(decoded.snapshot.rendering.ambientLightIntensity).toBe(0)
    expect(decoded.snapshot.rendering.sunLightIntensity).toBe(10)
    expect(decoded.snapshot.rendering.sunEmissiveIntensity).toBe(20)
    expect(decoded.snapshot.rendering.sunEmissiveColor).toBe('#ffcc55')
    expect(decoded.snapshot.rendering.sunPostprocessExposure).toBe(10)
    expect(decoded.snapshot.rendering.sunPostprocessToneMap).toBe('acesLike')
    expect(decoded.snapshot.rendering.sunPostprocessBloomThreshold).toBe(5)
    expect(decoded.snapshot.rendering.sunPostprocessBloomStrength).toBe(2)
    expect(decoded.snapshot.rendering.sunPostprocessBloomRadius).toBe(0)
    expect(decoded.snapshot.rendering.sunPostprocessBloomResolutionScale).toBe(0.1)
  })
})
