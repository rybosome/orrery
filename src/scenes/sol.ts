import { kernels } from '@rybosome/tspice'

import { J2000_FRAME } from '../spice/types.js'
import {
  DEFAULT_RESUME_RATE_DAY_SEC_PER_SEC,
  DEFAULT_RESUME_RATE_HOUR_SEC_PER_SEC,
} from '../time/defaultPlaybackRate.js'
import { DEFAULT_QUANTUM_SEC, DEFAULT_STEP_SEC, RATE_LADDER } from '../time/timeStore.js'
import { VIEWER_SCRUB_UTC_HARD_MAX, VIEWER_SCRUB_UTC_HARD_MIN } from '../time/viewerTimeBounds.js'
import type { SceneDefinition } from './sceneDefinition.js'
import { SOL_BODIES } from './solBodies.js'

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
    minUtc: VIEWER_SCRUB_UTC_HARD_MIN,
    maxUtc: VIEWER_SCRUB_UTC_HARD_MAX,
    initialEtSec: 0,
    quantumSec: DEFAULT_QUANTUM_SEC,
    stepSec: DEFAULT_STEP_SEC,
    rateLadder: RATE_LADDER,
    resumeRates: {
      closeSecPerSec: DEFAULT_RESUME_RATE_HOUR_SEC_PER_SEC,
      wideSecPerSec: DEFAULT_RESUME_RATE_DAY_SEC_PER_SEC,
    },
  },
  viewer: {
    initialFocusId: 'EARTH',
    cameraFovDeg: 50,
    ambientLightIntensity: 0.45,
    starEmission: { intensity: 10, color: '#ffcc55' },
  },
} satisfies SceneDefinition
