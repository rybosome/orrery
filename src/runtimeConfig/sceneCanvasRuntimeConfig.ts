export type SunPostprocessMode = 'off' | 'wholeFrame' | 'sunIsolated'

export type SunToneMap = 'none' | 'filmic' | 'acesLike'

export type SceneCanvasRuntimeConfig = {
  isE2e: boolean
  enableLogDepth: boolean

  /** Stable seed used for starfield + skydome noise. */
  starSeed: number

  /** Enables Milky Way / skydome background effects. */
  animatedSky: boolean

  /** Enables background sky twinkle. */
  skyTwinkle: boolean

  /** Optional ET seconds for initial time (e2e-only query override). */
  initialEt: number | null

  // Sun postprocessing startup config.
  sunPostprocessMode: SunPostprocessMode
  sunExposure: number
  sunToneMap: SunToneMap
  sunBloomThreshold: number
  sunBloomStrength: number
  sunBloomRadius: number
  sunBloomResolutionScale: number
}

const parseNumber = (searchParams: URLSearchParams, key: string) => {
  const raw = searchParams.get(key)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

const parseEnum = <T extends string>(searchParams: URLSearchParams, key: string, allowed: readonly T[]): T | null => {
  const raw = searchParams.get(key)
  if (!raw) return null
  const normalized = raw.trim()
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : null
}

/**
 * Parse supported runtime query flags from `window.location.search`.
 *
 * Query-param policy (Issue #21 PR4):
 * - Keep only explicit debug/e2e startup flags.
 * - Scene-state sharing should flow through `/s/<payload>` snapshots.
 *
 * Retained params:
 * - `?e2e=1` (or presence): deterministic e2e mode
 * - `?et=<number>`: initial ET override (e2e mode only)
 * - `?sunPostprocessMode=off|wholeFrame|sunIsolated` (e2e mode only)
 * - `?sunToneMap=none|filmic|acesLike` (e2e mode only)
 * - `?logDepth=1` (or presence): debug precision toggle
 */
export function parseSceneCanvasRuntimeConfigFromLocationSearch(locationSearch: string): SceneCanvasRuntimeConfig {
  const searchParams = new URLSearchParams(locationSearch)

  const isE2e = searchParams.has('e2e')
  const enableLogDepth = searchParams.has('logDepth')

  // E2E snapshots must be stable regardless of Math.random overrides.
  const starSeed = isE2e ? 1 : 1337

  // Sky effects defaults.
  // - Interactive: skydome ON, twinkle OFF.
  // - E2E: both OFF for deterministic screenshots.
  const animatedSky = !isE2e
  const skyTwinkle = false

  // Keep initial ET query loading as an explicit e2e-only boot hook.
  const initialEt = isE2e ? parseNumber(searchParams, 'et') : null

  // Sun postprocessing mode defaults:
  // - E2E: disabled unless explicitly requested for postprocess screenshot tests.
  // - Interactive: whole-frame postprocessing enabled by default.
  const sunPostprocessModeDefault: SunPostprocessMode = isE2e ? 'off' : 'wholeFrame'
  const sunPostprocessMode = isE2e
    ? parseEnum(searchParams, 'sunPostprocessMode', ['off', 'wholeFrame', 'sunIsolated'] as const) ??
      sunPostprocessModeDefault
    : sunPostprocessModeDefault

  // Postprocess tuning defaults (live-tuned from UI and snapshot payloads).
  const sunExposure = 1.5
  const sunToneMapDefault: SunToneMap = 'acesLike'
  const sunToneMap = isE2e
    ? parseEnum(searchParams, 'sunToneMap', ['none', 'filmic', 'acesLike'] as const) ?? sunToneMapDefault
    : sunToneMapDefault

  // Bloom defaults tuned for Sun appearance.
  const sunBloomThreshold = 1.5
  const sunBloomStrength = 0.15
  const sunBloomRadius = 0.05
  const sunBloomResolutionScale = 1

  return {
    isE2e,
    enableLogDepth,
    starSeed,
    animatedSky,
    skyTwinkle,
    initialEt,
    sunPostprocessMode,
    sunExposure,
    sunToneMap,
    sunBloomThreshold,
    sunBloomStrength,
    sunBloomRadius,
    sunBloomResolutionScale,
  }
}
