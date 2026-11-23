import type { BodyRef, FrameId } from '../spice/types.js'

export type BodyTextureKind = 'earth' | 'moon' | 'sun'

/** Surface texture styling (either an asset URL or a lightweight procedural texture). */
export interface BodySurfaceTextureStyle {
  /**
   * Optional texture URL/path.
   *
   * If relative, it's resolved against Vite's `BASE_URL` at runtime.
   */
  url?: string

  /** Optional, lightweight procedural texture (no binary assets). */
  kind?: BodyTextureKind

  /**
   * Optional material color multiplier to apply when a texture is present.
   *
   * Note: `MeshStandardMaterial.color` multiplies the texture (`map`). Most
   * full-color albedo textures should use `"#ffffff"` here to avoid tinting.
   */
  color?: string
}

/** Surface material styling for a renderable body (color + optional texture/tuning). */
export interface BodySurfaceStyle {
  /** Renderer color hint (e.g. `"#ffffff"`, `"skyblue"`). */
  color: string

  /** Optional surface texture settings. */
  texture?: BodySurfaceTextureStyle

  /** Optional normal map (tangent-space) texture; should be equirectangular 2:1. */
  normalTexture?: { url: string }

  /** Optional roughness map texture; should be equirectangular 2:1. */
  roughnessTexture?: { url: string }

  /**
   * Optional normal-map strength.
   *
   * Three.js uses a `Vector2` for `normalScale`; allow a scalar shortcut.
   */
  normalScale?: number | { x: number; y: number }

  /** Optional `MeshStandardMaterial` tuning. */
  roughness?: number

  /** Optional `MeshStandardMaterial` tuning. */
  metalness?: number

  /**
   * Optional bump strength.
   *
   * If set and a texture map is present, the renderer will reuse the map as a
   * cheap bump source to add some rocky/cratered relief.
   *
   * Notes:
   * - Values are clamped to `0..0.25` (Three.js accepts unbounded values but
   *   large scales can cause extreme artifacts).
   * - Typical values are around `~0..0.1`.
   * - We reuse the surface albedo as the height source; this is a shortcut and
   *   can produce artifacts (e.g. relief correlated with lighting/color changes).
   */
  bumpScale?: number

  /**
   * Optional night-side albedo floor (0..1).
   *
   * This suppresses ambient-lit albedo on the night side so planets don't look
   * "washed out" under the scene's ambient light.
   */
  nightAlbedo?: number

  /**
   * Smoothstep band around the terminator, in N·L space (0..1-ish).
   *
   * Smaller values = sharper terminator.
   */
  terminatorTwilight?: number

  /**
   * Optional, subtle procedural albedo modulation for macro/detail variation
   * without obvious tiling or additional texture assets.
   *
   * Values are applied conservatively in shader space; keep `strength` small.
   */
  detailNoise?: {
    /** Multiplier for the albedo modulation (0..~0.1). */
    strength?: number
    /** Frequency for seam-safe direction-space noise (higher = finer detail). */
    scale?: number
    /** Optional seed offset for deterministic variation between bodies. */
    seed?: number
  }
}

/** Layer style for a generic atmosphere shell. */
export interface AtmosphereAppearanceLayerStyle {
  kind: 'atmosphere'
  atmosphere: {
    /** Shell radius relative to the body radius. */
    radiusRatio?: number
    /** Draw order for transparent shells. */
    renderOrder?: number
    /** Additive glow color. */
    color?: string
    /** Opacity/intensity scalar (0..1-ish). */
    intensity?: number
    /** Rim falloff exponent (higher = tighter rim). */
    rimPower?: number
    /** 0 = symmetric rim, 1 = fully sun-biased rim. */
    sunBias?: number
  }
}

/** Layer style for a thin aerosol haze shell (for example Mars dust). */
export interface AerosolAppearanceLayerStyle {
  kind: 'aerosol'
  aerosol: {
    /** Shell radius relative to the body radius. */
    radiusRatio?: number
    /** Additive glow color. */
    color?: string
    /** Opacity/intensity scalar (0..1-ish). */
    intensity?: number
    /** Rim falloff exponent (higher = tighter rim). */
    rimPower?: number
    /** 0 = symmetric rim, 1 = fully sun-biased rim. */
    sunBias?: number
  }
}

/** Fallback layer style for unrecognized kinds (keeps layer schemas explicit). */
export interface UnknownBodyLayerStyle {
  kind: string
  /**
   * Payload for unrecognized layer kinds.
   *
   * This avoids allowing arbitrary top-level keys on layers, making registry
   * mistakes easier to catch.
   */
  data: Record<string, unknown>
}

// Extensible: new layer kinds (atmosphere, clouds, decals, etc.) can be added later.
// Keep this intentionally open, but structurally explicit.
export type BodyLayerStyle = AtmosphereAppearanceLayerStyle | AerosolAppearanceLayerStyle | UnknownBodyLayerStyle

/** Type guard for atmosphere appearance layers. */
export function isAtmosphereAppearanceLayer(layer: BodyLayerStyle): layer is AtmosphereAppearanceLayerStyle {
  if (typeof layer !== 'object' || layer === null) return false

  const maybeKind = (layer as { kind?: unknown }).kind
  if (maybeKind !== 'atmosphere') return false

  const atmosphere = (layer as { atmosphere?: unknown }).atmosphere
  return typeof atmosphere === 'object' && atmosphere !== null
}

/** Type guard for aerosol appearance layers. */
export function isAerosolAppearanceLayer(layer: BodyLayerStyle): layer is AerosolAppearanceLayerStyle {
  if (typeof layer !== 'object' || layer === null) return false

  const maybeKind = (layer as { kind?: unknown }).kind
  if (maybeKind !== 'aerosol') return false

  const aerosol = (layer as { aerosol?: unknown }).aerosol
  return typeof aerosol === 'object' && aerosol !== null
}

/** Composite appearance style (surface + optional rings + optional layers). */
export interface BodyAppearanceStyle {
  surface: BodySurfaceStyle

  /** Fixed right-handed rotation in radians around body-local +Z (north). */
  textureLongitudeOffsetRad?: number

  /** Emissive surface and optional selective bloom participation. */
  emission?: { color: string; intensity: number; bloom?: boolean }

  /** Emissive map masked to the night side. */
  nightLights?: { textureUrl: string; intensity?: number; twilight?: number }

  /** Cloud alpha map and shell settings. Drift is around body-local +Z per ET second. */
  clouds?: {
    textureUrl: string
    radiusRatio?: number
    opacity?: number
    alphaTest?: number
    driftRadPerSec?: number
    nightMultiplier?: number
    twilight?: number
    alignWithSurface?: boolean
  }

  /** Water reflectance from an optional mask or an authored blue-albedo fallback. */
  water?: { maskTextureUrl?: string; blueAlbedoFallback?: boolean; roughness?: number; specularIntensity?: number }

  /** Optional rings style (rendered as a child mesh). */
  rings?: SceneRingsStyle

  /** Optional additional layers (clouds, atmosphere, etc). */
  layers?: BodyLayerStyle[]
}

/** Ring rendering style (sizes relative to body radius + texture). */
export interface SceneRingsStyle {
  /** Inner radius relative to the parent body's radius. */
  innerRadiusRatio: number
  /** Outer radius relative to the parent body's radius. */
  outerRadiusRatio: number
  /** Ring texture URL/path (typically RGBA PNG). */
  textureUrl: string
  /** Optional material tint color. */
  color?: string

  /** Optional baseline opacity applied across the whole annulus (0..1). */
  baseOpacity?: number
}

/**
 * Renderer-facing scene description (types only).
 *
 * The intent is to describe *what to render* separately from *how to fetch
 * SPICE state*.
 */

/** Renderer-facing style for a body (size + appearance + optional UI label). */
export interface SceneBodyStyle {
  /** Body radius in km. */
  radiusKm: number

  /** Generalized appearance model (surface + optional rings + extensible layers). */
  appearance: BodyAppearanceStyle

  /** Optional label to show in UI. */
  label?: string
}

/** Scene body entry linking a SPICE body ref to a renderer style. */
export interface SceneBody {
  /** NAIF ID or body name; fed into `SpiceClient.getBodyState`. */
  body: BodyRef

  /** Optional body-fixed frame for debug axes (e.g. `"IAU_EARTH"`). */
  bodyFixedFrame?: FrameId

  style: SceneBodyStyle
}
