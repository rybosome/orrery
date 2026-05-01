/** Runtime capability tiers used by loading and render quality controls. */
export type DeviceTier = 'high' | 'medium' | 'low'

/**
 * Quality/performance budgets attached to one device tier.
 *
 * These values are intentionally conservative and deterministic so follow-up
 * tuning PRs can safely adjust numbers without changing the API shape.
 */
export interface DeviceTierBudgets {
  /** Upper bound passed to the Three.js renderer pixel-ratio clamp. */
  maxRendererPixelRatio: number

  /** Procedural loading visual update cap (Hz). */
  loadingVisualFpsCap: number

  /** Procedural loading particle budget. */
  loadingParticleCount: number

  /** Number of concentric instrument rings in the loading visual. */
  loadingRingCount: number

  /** Number of scanline bands in the loading visual. */
  loadingScanlineCount: number

  /** Multiplicative intensity scalar in `[0, 1]` for visual effects. */
  loadingEffectIntensity: number
}

/**
 * Optional explicit inputs used to classify hardware capability.
 *
 * When omitted, `detectDeviceTier` derives metrics from `window`/`navigator`
 * (if available).
 */
export interface DeviceTierDetectionInput {
  hardwareConcurrency?: number | null
  deviceMemoryGb?: number | null
  maxTouchPoints?: number | null
  devicePixelRatio?: number | null
  viewportWidthPx?: number | null
  viewportHeightPx?: number | null
  prefersReducedMotion?: boolean | null

  /**
   * When true, force the lowest tier for deterministic e2e behavior.
   *
   * This avoids introducing noisy visual complexity into screenshot-based
   * baselines while still exercising the tiering codepath.
   */
  isE2e?: boolean | null
}

/**
 * Fully normalized capability metrics used by tier scoring.
 */
export interface DeviceTierDetectionSnapshot {
  hardwareConcurrency: number
  deviceMemoryGb: number
  maxTouchPoints: number
  devicePixelRatio: number
  viewportWidthPx: number
  viewportHeightPx: number
  prefersReducedMotion: boolean
  isE2e: boolean
}

/**
 * Full tier resolution output, including score and normalized inputs.
 */
export interface DeviceTierProfile {
  tier: DeviceTier
  score: number
  budgets: DeviceTierBudgets
  input: DeviceTierDetectionSnapshot
}

/**
 * Canonical budget table by device tier.
 */
export const DEVICE_TIER_BUDGETS: Record<DeviceTier, DeviceTierBudgets> = {
  high: {
    maxRendererPixelRatio: 2,
    loadingVisualFpsCap: 60,
    loadingParticleCount: 56,
    loadingRingCount: 4,
    loadingScanlineCount: 22,
    loadingEffectIntensity: 1,
  },
  medium: {
    maxRendererPixelRatio: 1.5,
    loadingVisualFpsCap: 45,
    loadingParticleCount: 34,
    loadingRingCount: 3,
    loadingScanlineCount: 15,
    loadingEffectIntensity: 0.78,
  },
  low: {
    maxRendererPixelRatio: 1.2,
    loadingVisualFpsCap: 30,
    loadingParticleCount: 18,
    loadingRingCount: 2,
    loadingScanlineCount: 9,
    loadingEffectIntensity: 0.55,
  },
}

/**
 * Return a defensive copy of budgets for one tier.
 */
export function resolveDeviceTierBudgets(tier: DeviceTier): DeviceTierBudgets {
  return { ...DEVICE_TIER_BUDGETS[tier] }
}

/**
 * Detect a deterministic device capability tier.
 *
 * Heuristic model:
 * - CPU capacity (`hardwareConcurrency`)
 * - memory (`deviceMemory`)
 * - effective pixel workload (`viewport * pixelRatio²`)
 * - compact-touch penalty (small touch-first devices)
 * - reduced-motion preference bias toward lower-intensity visuals
 */
export function detectDeviceTier(input: DeviceTierDetectionInput = readDeviceTierDetectionInput()): DeviceTierProfile {
  const normalized = normalizeDetectionInput(input)

  if (normalized.isE2e) {
    return {
      tier: 'low',
      score: Number.NEGATIVE_INFINITY,
      budgets: resolveDeviceTierBudgets('low'),
      input: normalized,
    }
  }

  let score = 0
  score += scoreHardwareConcurrency(normalized.hardwareConcurrency)
  score += scoreDeviceMemory(normalized.deviceMemoryGb)
  score += scoreEffectiveRenderPixels(
    normalized.viewportWidthPx,
    normalized.viewportHeightPx,
    normalized.devicePixelRatio,
  )
  score += scoreCompactTouchDevice(
    normalized.maxTouchPoints,
    normalized.viewportWidthPx,
    normalized.viewportHeightPx,
  )
  score += normalized.prefersReducedMotion ? -2 : 0

  const tier = score >= 6 ? 'high' : score >= 1 ? 'medium' : 'low'

  return {
    tier,
    score,
    budgets: resolveDeviceTierBudgets(tier),
    input: normalized,
  }
}

function normalizeDetectionInput(input: DeviceTierDetectionInput): DeviceTierDetectionSnapshot {
  return {
    hardwareConcurrency: sanitizeCount(input.hardwareConcurrency),
    deviceMemoryGb: sanitizeMemory(input.deviceMemoryGb),
    maxTouchPoints: sanitizeCount(input.maxTouchPoints),
    devicePixelRatio: sanitizePositive(input.devicePixelRatio, 1),
    viewportWidthPx: sanitizeCount(input.viewportWidthPx),
    viewportHeightPx: sanitizeCount(input.viewportHeightPx),
    prefersReducedMotion: Boolean(input.prefersReducedMotion),
    isE2e: Boolean(input.isE2e),
  }
}

function scoreHardwareConcurrency(value: number): number {
  if (value >= 12) return 4
  if (value >= 8) return 3
  if (value >= 6) return 2
  if (value >= 4) return 1
  if (value >= 2) return 0
  return -1
}

function scoreDeviceMemory(value: number): number {
  if (value >= 12) return 4
  if (value >= 8) return 3
  if (value >= 4) return 2
  if (value >= 2) return 1
  if (value > 0) return -1
  return 0
}

function scoreEffectiveRenderPixels(widthPx: number, heightPx: number, dpr: number): number {
  const effectivePixels = widthPx * heightPx * dpr * dpr

  if (effectivePixels >= 9_000_000) return -3
  if (effectivePixels >= 6_000_000) return -2
  if (effectivePixels >= 3_500_000) return -1
  if (effectivePixels > 0 && effectivePixels <= 1_250_000) return 1
  return 0
}

function scoreCompactTouchDevice(maxTouchPoints: number, widthPx: number, heightPx: number): number {
  const shortestEdge = Math.min(widthPx, heightPx)
  if (maxTouchPoints >= 2 && shortestEdge > 0 && shortestEdge <= 900) return -1
  return 0
}

function readDeviceTierDetectionInput(): DeviceTierDetectionInput {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {}
  }

  const nav = navigator as Navigator & {
    deviceMemory?: number
  }

  return {
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: nav.deviceMemory,
    maxTouchPoints: navigator.maxTouchPoints,
    devicePixelRatio: window.devicePixelRatio,
    viewportWidthPx: window.innerWidth,
    viewportHeightPx: window.innerHeight,
    prefersReducedMotion: readPrefersReducedMotion(),
  }
}

function readPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function sanitizeCount(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

function sanitizeMemory(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0
  return Math.max(0, value)
}

function sanitizePositive(value: number | null | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.max(0.5, value)
}
