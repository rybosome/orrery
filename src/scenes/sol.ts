import { kernels } from '@rybosome/tspice'

import { J2000_FRAME } from '../spice/types.js'
import {
  DEFAULT_RESUME_RATE_DAY_SEC_PER_SEC,
  DEFAULT_RESUME_RATE_HOUR_SEC_PER_SEC,
  DEFAULT_RESUME_RATE_WEEK_SEC_PER_SEC,
} from '../time/defaultPlaybackRate.js'
import type { SceneDefinition } from './sceneDefinition.js'
import { SOL_BODIES } from './solBodies.js'
import { getHomePresetStateForKey, HOME_PRESET_KEYS } from './solHomePresets.js'
import { SOLAR_SCALE_CAMERA_STATE } from './solScalePresets.js'

const homePoses = new Map(HOME_PRESET_KEYS.map((id) => [id, getHomePresetStateForKey(id)] as const))
const homeRadii = [...homePoses.values()].map((pose) => pose.radius)

/**
 * Rate ladder (simulation seconds per wall-clock second).
 * Includes both forward and reverse rates for easy cycling.
 * Values are sorted from slowest reverse to fastest forward.
 */
export const RATE_LADDER = [
  -86400 * 365, // -1 year/s (reverse)
  -86400 * 30, // -1 month/s (reverse)
  -86400 * 7, // -1 week/s (reverse)
  -86400, // -1 day/s (reverse)
  -3600, // -1 hour/s (reverse)
  -60, // -1 minute/s (reverse)
  -1, // -1x (reverse real-time)
  0, // Paused
  1, // 1x (real-time)
  60, // 1 minute/s
  3600, // 1 hour/s
  86400, // 1 day/s
  86400 * 7, // 1 week/s
  86400 * 30, // 1 month/s
  86400 * 365, // 1 year/s
] as const

/** The Solar System package shipped by the viewer. */
export const SOL_SCENE = {
  id: 'sol',
  title: 'Solar System',
  kernelPack: kernels
    .custom({ origin: 'static/kernels/naif/', pathBase: 'naif/' })
    .pick(['lsk/naif0012.tls', 'pck/pck00011.tpc', 'spk/planets/de432s.bsp']),
  coordinates: { frame: J2000_FRAME, observer: 'SUN' },
  bodies: SOL_BODIES,
  primaryLight: { bodyId: 'SUN', color: '#ffffff', intensity: 2.1 },
  time: {
    minUtc: '1950-01-01T00:00:00Z',
    maxUtc: '2050-01-01T23:58:00Z', // The SPK ends at Jan 2 00:00:00 TDB; UTC trails TDB by about 69 s.
    initialEtSec: 0,
    quantumSec: 0.1,
    stepSec: 60,
    rateLadder: RATE_LADDER,
    resumeRates: {
      closeSecPerSec: DEFAULT_RESUME_RATE_HOUR_SEC_PER_SEC,
      wideSecPerSec: DEFAULT_RESUME_RATE_DAY_SEC_PER_SEC,
      maxSecPerSec: DEFAULT_RESUME_RATE_WEEK_SEC_PER_SEC,
    },
  },
  viewer: {
    initialFocusId: 'EARTH',
    cameraFovDeg: 50,
    homePoses,
    scalePresets: {
      planetary: { focusId: 'EARTH', planetMultiplier: 1, starMultiplier: 1 },
      solar: { focusId: 'SUN', planetMultiplier: 800, starMultiplier: 12, cameraPose: SOLAR_SCALE_CAMERA_STATE },
    },
    radiusLimits: {
      minRadius: Math.min(...homeRadii) * 0.25,
      maxRadius: Math.max(...homeRadii) * 20_000,
    },
    ambientLightIntensity: 0.45,
    starEmission: { intensity: 10, color: '#ffcc55' },
  },
} satisfies SceneDefinition
