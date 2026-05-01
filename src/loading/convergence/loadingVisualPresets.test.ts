import { describe, expect, it } from 'vitest'

import { DEVICE_TIER_BUDGETS, type DeviceTier, type DeviceTierProfile } from '../deviceTier.js'
import {
  DEFAULT_LOADING_VISUAL_PRESET,
  compareLoadingVisualPresets,
  recommendLoadingVisualPreset,
  resolveLoadingVisualPresetBudgets,
  resolveLoadingVisualPresetConfig,
} from './loadingVisualPresets.js'

describe('loadingVisualPresets', () => {
  it('documents and resolves hybrid as the default recommendation', () => {
    expect(DEFAULT_LOADING_VISUAL_PRESET).toBe('hybrid')
    expect(resolveLoadingVisualPresetConfig().key).toBe('hybrid')
  })

  it('recommends hybrid for medium-tier baseline startup', () => {
    const recommendation = recommendLoadingVisualPreset({
      device: createDeviceTierProfile({ tier: 'medium', score: 3 }),
      telemetry: {
        phase: 'assetResolve',
        readinessValue: 0.42,
        hasFailure: false,
      },
    })

    expect(recommendation.diagnostics.selectedPreset).toBe('hybrid')
    expect(recommendation.rankedPresets[0]).toBe('hybrid')
    expect(recommendation.scores.hybrid).toBeGreaterThan(recommendation.scores.instrument)
    expect(recommendation.scores.hybrid).toBeGreaterThan(recommendation.scores.cosmic)
  })

  it('recommends cosmic when high-tier headroom and late convergence favor immersion', () => {
    const recommendation = recommendLoadingVisualPreset({
      device: createDeviceTierProfile({ tier: 'high', score: 8 }),
      telemetry: {
        phase: 'converge',
        readinessValue: 0.9,
        hasFailure: false,
      },
    })

    expect(recommendation.diagnostics.selectedPreset).toBe('cosmic')
    expect(recommendation.rankedPresets[0]).toBe('cosmic')
    expect(recommendation.scores.cosmic).toBeGreaterThan(recommendation.scores.hybrid)
  })

  it('recommends instrument for constrained/reduced-motion failure scenarios', () => {
    const recommendation = recommendLoadingVisualPreset({
      device: createDeviceTierProfile({ tier: 'low', score: -1, prefersReducedMotion: true }),
      telemetry: {
        phase: 'converge',
        readinessValue: 0.7,
        hasFailure: true,
      },
    })

    expect(recommendation.diagnostics.selectedPreset).toBe('instrument')
    expect(recommendation.rankedPresets[0]).toBe('instrument')
    expect(recommendation.scores.instrument).toBeGreaterThan(recommendation.scores.hybrid)
    expect(recommendation.scores.instrument).toBeGreaterThan(recommendation.scores.cosmic)
  })

  it('applies preset budget scaling while keeping bounded graceful degradation', () => {
    const cosmicLowBudget = resolveLoadingVisualPresetBudgets(
      DEVICE_TIER_BUDGETS.low,
      resolveLoadingVisualPresetConfig('cosmic'),
    )

    expect(cosmicLowBudget.maxRendererPixelRatio).toBe(DEVICE_TIER_BUDGETS.low.maxRendererPixelRatio)
    expect(cosmicLowBudget.loadingVisualFpsCap).toBe(30)
    expect(cosmicLowBudget.loadingParticleCount).toBe(22)
    expect(cosmicLowBudget.loadingRingCount).toBe(2)
    expect(cosmicLowBudget.loadingScanlineCount).toBe(11)
    expect(cosmicLowBudget.loadingEffectIntensity).toBeCloseTo(0.649)

    const instrumentMediumBudget = resolveLoadingVisualPresetBudgets(
      DEVICE_TIER_BUDGETS.medium,
      resolveLoadingVisualPresetConfig('instrument'),
    )

    expect(instrumentMediumBudget.loadingVisualFpsCap).toBe(43)
    expect(instrumentMediumBudget.loadingParticleCount).toBe(26)
    expect(instrumentMediumBudget.loadingRingCount).toBe(3)
    expect(instrumentMediumBudget.loadingScanlineCount).toBe(14)
    expect(instrumentMediumBudget.loadingEffectIntensity).toBeCloseTo(0.6708)
  })

  it('returns deterministic descending ranking from comparison scores', () => {
    const comparison = compareLoadingVisualPresets({
      device: createDeviceTierProfile({ tier: 'medium', score: 2 }),
      telemetry: {
        phase: 'deepLinkResolve',
        readinessValue: 0.58,
        hasFailure: false,
      },
    })

    const [first, second, third] = comparison.rankedPresets
    expect(comparison.scores[first]).toBeGreaterThanOrEqual(comparison.scores[second])
    expect(comparison.scores[second]).toBeGreaterThanOrEqual(comparison.scores[third])
  })
})

function createDeviceTierProfile(args: {
  tier: DeviceTier
  score: number
  prefersReducedMotion?: boolean
}): DeviceTierProfile {
  return {
    tier: args.tier,
    score: args.score,
    budgets: { ...DEVICE_TIER_BUDGETS[args.tier] },
    input: {
      hardwareConcurrency: 8,
      deviceMemoryGb: 8,
      maxTouchPoints: 0,
      devicePixelRatio: 1,
      viewportWidthPx: 1440,
      viewportHeightPx: 900,
      prefersReducedMotion: Boolean(args.prefersReducedMotion),
      isE2e: false,
    },
  }
}
