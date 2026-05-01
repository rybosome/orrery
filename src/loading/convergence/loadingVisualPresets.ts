import type { DeviceTier, DeviceTierBudgets, DeviceTierProfile } from '../deviceTier.js'
import type { LoadingPhase } from '../loadingStore.js'
import type { ConvergencePrimitiveTuning } from './convergenceModel.js'

/** Canonical loading visual presets explored in PR7. */
export type LoadingVisualPresetKey = 'instrument' | 'cosmic' | 'hybrid'

/** Source marker for deterministic preset selection. */
export type LoadingVisualPresetRecommendationSource = 'recommended' | 'fallback-default'

/**
 * Snapshot of loading telemetry fed into preset recommendation.
 */
export interface LoadingVisualTelemetrySnapshot {
  phase: LoadingPhase
  readinessValue: number
  hasFailure: boolean
}

/**
 * Parameter bundle that scales tier budgets per visual preset.
 */
export interface LoadingVisualPresetBudgetTuning {
  particleComplexity: number
  ringComplexity: number
  scanlineComplexity: number
  effectIntensity: number
  fpsCap: number
}

/**
 * Overlay-level affordance tuning for one visual preset.
 */
export interface LoadingVisualPresetOverlayAffordance {
  backdropStrength: number
  glowStrength: number
  particleDrift: number
  sweepSpeed: number
  reticleScale: number
}

/**
 * Complete preset config: convergence tuning + overlay budgets + affordances.
 */
export interface LoadingVisualPresetConfig {
  key: LoadingVisualPresetKey
  convergenceTuning: Partial<ConvergencePrimitiveTuning>
  budgetTuning: LoadingVisualPresetBudgetTuning
  overlayAffordance: LoadingVisualPresetOverlayAffordance
}

/**
 * Stable diagnostics metadata emitted with boot telemetry and e2e payloads.
 */
export interface LoadingVisualPresetDiagnostics {
  selectedPreset: LoadingVisualPresetKey
  recommendedPreset: LoadingVisualPresetKey
  defaultPreset: LoadingVisualPresetKey
  recommendationSource: LoadingVisualPresetRecommendationSource
  rankedPresets: ReadonlyArray<LoadingVisualPresetKey>
  scores: Record<LoadingVisualPresetKey, number>
}

/**
 * Recommendation input combining telemetry + UX/device constraints.
 */
export interface LoadingVisualPresetRecommendationInput {
  device: Pick<DeviceTierProfile, 'tier' | 'score' | 'budgets' | 'input'>
  telemetry: LoadingVisualTelemetrySnapshot
}

/**
 * Comparison output (ranked presets + scoring criteria).
 */
export interface LoadingVisualPresetComparison {
  scores: Record<LoadingVisualPresetKey, number>
  rankedPresets: ReadonlyArray<LoadingVisualPresetKey>
  criteria: {
    performancePressure: number
    motionSensitivity: number
    failureUrgency: number
    convergenceProgress: number
  }
}

/**
 * Complete recommendation result used for selection + diagnostics.
 */
export interface LoadingVisualPresetRecommendation extends LoadingVisualPresetComparison {
  diagnostics: LoadingVisualPresetDiagnostics
}

/**
 * PR7 default recommendation.
 *
 * `hybrid` is the default baseline because it keeps PR6's instrument clarity
 * while adding a bit of cosmic depth without over-spending low/medium budgets.
 */
export const DEFAULT_LOADING_VISUAL_PRESET: LoadingVisualPresetKey = 'hybrid'

/** Stable preset key ordering used for deterministic ranking/tie-breaks. */
export const LOADING_VISUAL_PRESET_KEYS: ReadonlyArray<LoadingVisualPresetKey> = ['instrument', 'cosmic', 'hybrid']

const LOADING_VISUAL_PRESET_CONFIGS: Record<LoadingVisualPresetKey, LoadingVisualPresetConfig> = {
  instrument: {
    key: 'instrument',
    convergenceTuning: {
      readinessExponent: 0.88,
      fadeStartReadiness: 0.8,
      fadeEndReadiness: 0.995,
      minPulseHz: 0.38,
      maxPulseHz: 1.7,
      maxSweepTurns: 2.45,
    },
    budgetTuning: {
      particleComplexity: 0.76,
      ringComplexity: 0.92,
      scanlineComplexity: 0.9,
      effectIntensity: 0.86,
      fpsCap: 0.95,
    },
    overlayAffordance: {
      backdropStrength: 0.88,
      glowStrength: 0.9,
      particleDrift: 0.72,
      sweepSpeed: 0.84,
      reticleScale: 0.98,
    },
  },

  cosmic: {
    key: 'cosmic',
    convergenceTuning: {
      readinessExponent: 1.08,
      fadeStartReadiness: 0.86,
      fadeEndReadiness: 0.998,
      minPulseHz: 0.55,
      maxPulseHz: 2.95,
      maxSweepTurns: 4.35,
    },
    budgetTuning: {
      particleComplexity: 1.24,
      ringComplexity: 1.12,
      scanlineComplexity: 1.18,
      effectIntensity: 1.18,
      fpsCap: 1,
    },
    overlayAffordance: {
      backdropStrength: 1.22,
      glowStrength: 1.24,
      particleDrift: 1.22,
      sweepSpeed: 1.32,
      reticleScale: 1.06,
    },
  },

  hybrid: {
    key: 'hybrid',
    convergenceTuning: {
      readinessExponent: 0.95,
      fadeStartReadiness: 0.83,
      fadeEndReadiness: 0.996,
      minPulseHz: 0.42,
      maxPulseHz: 2.35,
      maxSweepTurns: 3.45,
    },
    budgetTuning: {
      particleComplexity: 1,
      ringComplexity: 1,
      scanlineComplexity: 1,
      effectIntensity: 1,
      fpsCap: 1,
    },
    overlayAffordance: {
      backdropStrength: 1,
      glowStrength: 1,
      particleDrift: 1,
      sweepSpeed: 1,
      reticleScale: 1,
    },
  },
}

const BASE_PRESET_SCORES: Record<LoadingVisualPresetKey, number> = {
  instrument: 0.96,
  cosmic: 0.9,
  hybrid: 1.08,
}

const TIER_DELTAS: Record<DeviceTier, Record<LoadingVisualPresetKey, number>> = {
  high: {
    instrument: -0.2,
    cosmic: 0.6,
    hybrid: 0.15,
  },
  medium: {
    instrument: 0.12,
    cosmic: 0.18,
    hybrid: 0.35,
  },
  low: {
    instrument: 0.58,
    cosmic: -0.45,
    hybrid: 0.25,
  },
}

const RANK_TIE_BREAK: ReadonlyArray<LoadingVisualPresetKey> = [
  DEFAULT_LOADING_VISUAL_PRESET,
  'instrument',
  'cosmic',
]

/**
 * Resolve one preset config, with safe fallback to the documented default.
 */
export function resolveLoadingVisualPresetConfig(
  preset: LoadingVisualPresetKey = DEFAULT_LOADING_VISUAL_PRESET,
): LoadingVisualPresetConfig {
  return LOADING_VISUAL_PRESET_CONFIGS[preset] ?? LOADING_VISUAL_PRESET_CONFIGS[DEFAULT_LOADING_VISUAL_PRESET]
}

/**
 * Apply preset budget tuning to a tier budget envelope.
 */
export function resolveLoadingVisualPresetBudgets(
  baseBudgets: DeviceTierBudgets,
  presetConfig: Pick<LoadingVisualPresetConfig, 'budgetTuning'>,
): DeviceTierBudgets {
  const tuning = presetConfig.budgetTuning

  return {
    maxRendererPixelRatio: baseBudgets.maxRendererPixelRatio,
    loadingVisualFpsCap: clampCount(baseBudgets.loadingVisualFpsCap * sanitizePositive(tuning.fpsCap, 1), 12, 120),
    loadingParticleCount: clampCount(
      baseBudgets.loadingParticleCount * sanitizePositive(tuning.particleComplexity, 1),
      8,
      120,
    ),
    loadingRingCount: clampCount(baseBudgets.loadingRingCount * sanitizePositive(tuning.ringComplexity, 1), 1, 8),
    loadingScanlineCount: clampCount(
      baseBudgets.loadingScanlineCount * sanitizePositive(tuning.scanlineComplexity, 1),
      6,
      48,
    ),
    loadingEffectIntensity: clamp01(baseBudgets.loadingEffectIntensity * sanitizePositive(tuning.effectIntensity, 1)),
  }
}

/**
 * Score and rank all presets from telemetry + UX/device criteria.
 */
export function compareLoadingVisualPresets(
  input: LoadingVisualPresetRecommendationInput,
): LoadingVisualPresetComparison {
  const telemetry = normalizeTelemetry(input.telemetry)

  const scores: Record<LoadingVisualPresetKey, number> = {
    ...BASE_PRESET_SCORES,
  }

  addScoreDeltas(scores, TIER_DELTAS[input.device.tier])

  const performancePressure = clamp01(
    (1 - clamp01(input.device.budgets.loadingEffectIntensity)) * 0.55 +
      (1 - clamp01(input.device.budgets.loadingVisualFpsCap / 60)) * 0.45,
  )

  const motionSensitivity = input.device.input.prefersReducedMotion ? 1 : 0
  const failureUrgency = telemetry.hasFailure ? 1 : 0
  const convergenceProgress = telemetry.readinessValue

  addScoreDeltas(scores, scaleScoreDelta({ instrument: 0.9, hybrid: 0.45, cosmic: -0.75 }, performancePressure))
  addScoreDeltas(scores, scaleScoreDelta({ instrument: 1.1, hybrid: 0.5, cosmic: -1.2 }, motionSensitivity))
  addScoreDeltas(scores, scaleScoreDelta({ instrument: 1.2, hybrid: 0.6, cosmic: -1.1 }, failureUrgency))

  addScoreDeltas(scores, scaleScoreDelta({ instrument: -0.15, hybrid: 0.2, cosmic: 0.45 }, convergenceProgress))
  addScoreDeltas(scores, scaleScoreDelta({ instrument: 0.2, hybrid: 0.1, cosmic: -0.2 }, 1 - convergenceProgress))

  addScoreDeltas(scores, phaseDeltas(telemetry.phase))

  if (input.device.score >= 6) {
    addScoreDeltas(scores, { instrument: -0.08, hybrid: 0.08, cosmic: 0.22 })
  } else if (input.device.score <= 0) {
    addScoreDeltas(scores, { instrument: 0.28, hybrid: 0.05, cosmic: -0.18 })
  }

  const roundedScores = roundPresetScores(scores)
  const rankedPresets = rankPresets(roundedScores)

  return {
    scores: roundedScores,
    rankedPresets,
    criteria: {
      performancePressure: roundScore(performancePressure),
      motionSensitivity: roundScore(motionSensitivity),
      failureUrgency: roundScore(failureUrgency),
      convergenceProgress: roundScore(convergenceProgress),
    },
  }
}

/**
 * Deterministically recommend + select a loading visual preset.
 */
export function recommendLoadingVisualPreset(
  input: LoadingVisualPresetRecommendationInput,
): LoadingVisualPresetRecommendation {
  const comparison = compareLoadingVisualPresets(input)
  const hasRankedRecommendation = comparison.rankedPresets.length > 0
  const recommendedPreset = hasRankedRecommendation
    ? comparison.rankedPresets[0]
    : DEFAULT_LOADING_VISUAL_PRESET

  const diagnostics: LoadingVisualPresetDiagnostics = {
    selectedPreset: recommendedPreset,
    recommendedPreset,
    defaultPreset: DEFAULT_LOADING_VISUAL_PRESET,
    recommendationSource: hasRankedRecommendation ? 'recommended' : 'fallback-default',
    rankedPresets: [...comparison.rankedPresets],
    scores: { ...comparison.scores },
  }

  return {
    ...comparison,
    diagnostics,
  }
}

function addScoreDeltas(
  scores: Record<LoadingVisualPresetKey, number>,
  deltas: Partial<Record<LoadingVisualPresetKey, number>>,
): void {
  for (const preset of LOADING_VISUAL_PRESET_KEYS) {
    const delta = deltas[preset]
    if (delta == null || !Number.isFinite(delta)) continue
    scores[preset] += delta
  }
}

function rankPresets(scores: Record<LoadingVisualPresetKey, number>): LoadingVisualPresetKey[] {
  return [...LOADING_VISUAL_PRESET_KEYS].sort((a, b) => {
    const scoreDelta = scores[b] - scores[a]
    if (Math.abs(scoreDelta) > 1e-9) return scoreDelta

    return rankTieIndex(a) - rankTieIndex(b)
  })
}

function rankTieIndex(preset: LoadingVisualPresetKey): number {
  const index = RANK_TIE_BREAK.indexOf(preset)
  return index >= 0 ? index : RANK_TIE_BREAK.length
}

function roundPresetScores(
  scores: Record<LoadingVisualPresetKey, number>,
): Record<LoadingVisualPresetKey, number> {
  return {
    instrument: roundScore(scores.instrument),
    cosmic: roundScore(scores.cosmic),
    hybrid: roundScore(scores.hybrid),
  }
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000
}

function scaleScoreDelta(
  delta: Record<LoadingVisualPresetKey, number>,
  factor: number,
): Record<LoadingVisualPresetKey, number> {
  const normalizedFactor = clamp01(factor)

  return {
    instrument: delta.instrument * normalizedFactor,
    cosmic: delta.cosmic * normalizedFactor,
    hybrid: delta.hybrid * normalizedFactor,
  }
}

function phaseDeltas(phase: LoadingPhase): Record<LoadingVisualPresetKey, number> {
  switch (phase) {
    case 'booting':
    case 'spiceInit':
      return { instrument: 0.12, cosmic: -0.04, hybrid: 0.06 }

    case 'assetResolve':
    case 'deepLinkResolve':
      return { instrument: 0.05, cosmic: 0.02, hybrid: 0.09 }

    case 'converge':
      return { instrument: -0.03, cosmic: 0.15, hybrid: 0.1 }

    case 'ready':
      return { instrument: -0.12, cosmic: 0.2, hybrid: 0.08 }

    default:
      return { instrument: 0, cosmic: 0, hybrid: 0 }
  }
}

function normalizeTelemetry(snapshot: LoadingVisualTelemetrySnapshot): LoadingVisualTelemetrySnapshot {
  return {
    phase: snapshot.phase,
    readinessValue: clamp01(snapshot.readinessValue),
    hasFailure: Boolean(snapshot.hasFailure),
  }
}

function sanitizePositive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return value
}

function clampCount(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
