import type { FrameId, KernelPackId } from '../spice/types.js'

import type { SceneBodyDefinition } from './sceneDefinition.js'

export type BodyId =
  | 'SUN'
  | 'MERCURY'
  | 'VENUS'
  | 'EARTH'
  | 'MARS'
  | 'JUPITER'
  | 'SATURN'
  | 'URANUS'
  | 'NEPTUNE'
  | 'MOON'

export type BodyKind = 'star' | 'planet' | 'moon'

export type NaifIds = {
  /** The NAIF body ID (e.g. Earth=399, Jupiter=599). */
  body: number
  /** Optional NAIF barycenter ID for ephemeris kernels that provide barycenters instead. */
  barycenter?: number
}

/**
 * Registry entry describing a renderable body and its SPICE/visual metadata.
 */
export interface BodyRegistryEntry extends SceneBodyDefinition {
  id: BodyId

  /** Optional parent reference for moons (and potentially rings/spacecraft later). */
  parentId?: BodyId

  /**
   * Hook for future behavior: some bodies won't render without additional kernel packs.
   *
   * (No runtime behavior changes yet; this is just metadata.)
   */
  requiresKernelPack?: boolean

  /** The kernel pack required by this body (if any). */
  kernelPackId?: KernelPackId

  /** Optional body-fixed frame for debug axes (e.g. `"IAU_EARTH"`). */
  bodyFixedFrame?: FrameId
}

const DAY_SEC = 86_400

function orbitGuide(periodDays: number, center = 'SUN'): NonNullable<SceneBodyDefinition['orbitGuide']> {
  const periodSec = periodDays * DAY_SEC
  return {
    center,
    periodSec,
    spanSec: Math.min(periodSec, 50 * 365.25 * DAY_SEC),
    resampleEverySec: center === 'EARTH' ? 3_600 : DAY_SEC,
  }
}

export const SOL_BODIES: readonly BodyRegistryEntry[] = [
  {
    id: 'SUN',
    body: 'SUN',
    naifIds: { body: 10 },
    kind: 'star',
    style: {
      radiusKm: 695_700,
      appearance: {
        emission: { color: '#ffcc55', intensity: 10, bloom: true },
        surface: {
          color: '#ffb703',
          roughness: 0.2,
          texture: {
            url: 'static/textures/planets/sun.png',
            kind: 'sun',
            color: '#ffb703',
          },
        },
      },
      label: 'Sun',
    },
  },
  {
    id: 'MERCURY',
    orbitGuide: orbitGuide(87.969),
    // NOTE: de432s has barycenters for most planets (not the planet body IDs).
    body: 1,
    naifIds: { body: 199, barycenter: 1 },
    kind: 'planet',
    bodyFixedFrame: 'IAU_MERCURY',
    style: {
      radiusKm: 2_439.7,
      appearance: {
        surface: {
          color: '#9ca3af',
          // Mercury: rough, rocky, and airless.
          roughness: 0.98,
          metalness: 0.0,
          bumpScale: 0.035,
          // Suppress ambient-lit washout on the night side.
          nightAlbedo: 0.02,
          terminatorTwilight: 0.06,
          texture: {
            url: 'static/textures/planets/mercury.jpg',
            // Avoid unintentionally tinting/darkening the albedo texture.
            color: '#ffffff',
          },
        },
      },
      label: 'Mercury',
    },
  },
  {
    id: 'VENUS',
    orbitGuide: orbitGuide(224.701),
    body: 2,
    naifIds: { body: 299, barycenter: 2 },
    kind: 'planet',
    bodyFixedFrame: 'IAU_VENUS',
    style: {
      radiusKm: 6_051.8,
      appearance: {
        surface: {
          color: '#e9c46a',
          texture: {
            url: 'static/textures/planets/venus.png',
          },
        },
      },
      label: 'Venus',
    },
  },
  {
    id: 'EARTH',
    orbitGuide: orbitGuide(365.256),
    body: 'EARTH',
    naifIds: { body: 399, barycenter: 3 },
    kind: 'planet',
    bodyFixedFrame: 'IAU_EARTH',
    style: {
      radiusKm: 6_371,
      appearance: {
        surface: {
          color: '#2a9d8f',
          nightAlbedo: 0.004,
          terminatorTwilight: 0.12,
          texture: {
            url: 'static/textures/planets/earth.png',
            color: '#e6e6e6',
          },
        },
        nightLights: {
          textureUrl: 'static/textures/planets/earth-nightlights.jpg',
          intensity: 1.35,
          twilight: 0.12,
        },
        clouds: {
          textureUrl: 'static/textures/planets/earth-clouds.jpg',
          radiusRatio: 1.01,
          opacity: 0.85,
          alphaTest: 0.02,
          driftRadPerSec: 0.00004,
          nightMultiplier: 0,
          twilight: 0.12,
        },
        water: { blueAlbedoFallback: true, roughness: 0.06, specularIntensity: 0.35 },
        layers: [
          {
            kind: 'atmosphere',
            atmosphere: {
              radiusRatio: 1.015,
              renderOrder: 2,
              color: '#79b8ff',
              intensity: 0.55,
              rimPower: 2.2,
              sunBias: 0.65,
            },
          },
        ],
      },
      label: 'Earth',
    },
  },
  {
    id: 'MARS',
    orbitGuide: orbitGuide(686.98),
    body: 4,
    naifIds: { body: 499, barycenter: 4 },
    kind: 'planet',
    bodyFixedFrame: 'IAU_MARS',
    style: {
      radiusKm: 3_389.5,
      appearance: {
        surface: {
          color: '#e76f51',
          // Keep Mars quite rough so the Viking mosaic reads as albedo (avoid plastic/gloss).
          // With a roughness map, `roughness` is treated as a multiplier (Three.js behavior).
          roughness: 1.0,
          metalness: 0.0,

          // Disable bump mapping (we use a real normal map for Mars).
          bumpScale: 0.0,

          // DEM-derived normals + roughness proxy (see texture README for sources + generation notes).
          normalTexture: { url: 'static/textures/planets/mars-mola-normal-2k.png' },
          normalScale: 0.45,
          roughnessTexture: { url: 'static/textures/planets/mars-roughness-proxy-2k.png' },

          // Suppress ambient washout on the night side (Mars has no strong emissive features).
          nightAlbedo: 0.0008,
          terminatorTwilight: 0.08,
          // Subtle, seam-safe macro variation (no tiling textures).
          detailNoise: { strength: 0.035, scale: 10.0 },

          texture: {
            url: 'static/textures/planets/mars-viking-colorized-4k.jpg',
            // Full-color albedo texture; keep tint subtle so we don't lose surface contrast.
            color: '#ffffff',
          },
        },
        layers: [
          {
            kind: 'atmosphere',
            atmosphere: {
              // Very thin + subtle vs Earth.
              radiusRatio: 1.006,
              color: '#d9a16c',
              intensity: 0.14,
              rimPower: 2.8,
              sunBias: 0.9,
            },
          },
          {
            kind: 'aerosol',
            aerosol: {
              // Stylized warm dust/haze rim (non-physical).
              radiusRatio: 1.012,
              color: '#f0b07a',
              intensity: 0.05,
              rimPower: 3.8,
              sunBias: 0.85,
            },
          },
        ],
      },
      label: 'Mars',
    },
  },
  {
    id: 'JUPITER',
    orbitGuide: orbitGuide(4_332.589),
    body: 5,
    naifIds: { body: 599, barycenter: 5 },
    kind: 'planet',
    bodyFixedFrame: 'IAU_JUPITER',
    style: {
      radiusKm: 69_911,
      appearance: {
        surface: {
          color: '#f4a261',
          texture: {
            url: 'static/textures/planets/jupiter.png',
          },
        },
      },
      label: 'Jupiter',
    },
  },
  {
    id: 'SATURN',
    orbitGuide: orbitGuide(10_759.22),
    body: 6,
    naifIds: { body: 699, barycenter: 6 },
    kind: 'planet',
    bodyFixedFrame: 'IAU_SATURN',
    style: {
      radiusKm: 58_232,
      appearance: {
        surface: {
          color: '#f6bd60',
          texture: {
            url: 'static/textures/planets/saturn.png',
          },
        },
        rings: {
          // Roughly matches the main C/A ring span in units of Saturn radii.
          innerRadiusRatio: 1.28,
          outerRadiusRatio: 2.33,
          textureUrl: 'static/textures/planets/saturn-rings.png',
          color: '#d7c7a0',
        },
      },
      label: 'Saturn',
    },
  },
  {
    id: 'URANUS',
    orbitGuide: orbitGuide(30_685.4),
    body: 7,
    naifIds: { body: 799, barycenter: 7 },
    kind: 'planet',
    bodyFixedFrame: 'IAU_URANUS',
    style: {
      radiusKm: 25_362,
      appearance: {
        surface: {
          color: '#8ecae6',
          texture: {
            url: 'static/textures/planets/uranus.png',
          },
        },
        rings: {
          // Uranus' main rings are narrow and dark.
          // Radii are rough (in units of Uranus radii) but visually match the main ring region.
          innerRadiusRatio: 1.55,
          outerRadiusRatio: 2.05,
          textureUrl: 'static/textures/planets/uranus-rings.png',
          color: '#6b7280',
          // The Uranus rings texture only contains strong alpha for a narrow band
          // near the inner edge; clamp alpha so the full annulus reads as a
          // faint, thicker ring system.
          baseOpacity: 0.4,
        },
      },
      label: 'Uranus',
    },
  },
  {
    id: 'NEPTUNE',
    orbitGuide: orbitGuide(60_189),
    body: 8,
    naifIds: { body: 899, barycenter: 8 },
    kind: 'planet',
    bodyFixedFrame: 'IAU_NEPTUNE',
    style: {
      radiusKm: 24_622,
      appearance: {
        surface: {
          color: '#4361ee',
          texture: {
            url: 'static/textures/planets/neptune.png',
          },
        },
      },
      label: 'Neptune',
    },
  },
  {
    id: 'MOON',
    orbitGuide: orbitGuide(27.321_661, 'EARTH'),
    body: 'MOON',
    naifIds: { body: 301 },
    kind: 'moon',
    parentId: 'EARTH',
    requiresKernelPack: true,
    // Non-baseline: moons are intended to be download/opt-in later.
    kernelPackId: 'moon-default',
    bodyFixedFrame: 'IAU_MOON',
    style: {
      radiusKm: 1_737.4,
      appearance: {
        surface: {
          color: '#e9c46a',
          texture: {
            url: 'static/textures/planets/moon-lroc-4k.jpg',
          },
        },
      },
      label: 'Moon',
    },
  },
] as const
