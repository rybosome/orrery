import { describe, expect, it } from 'vitest'

import { detectDeviceTier, resolveDeviceTierBudgets } from './deviceTier.js'

describe('deviceTier', () => {
  it('classifies high capability devices into high tier', () => {
    const profile = detectDeviceTier({
      hardwareConcurrency: 16,
      deviceMemoryGb: 16,
      maxTouchPoints: 0,
      devicePixelRatio: 1.25,
      viewportWidthPx: 1920,
      viewportHeightPx: 1080,
      prefersReducedMotion: false,
    })

    expect(profile.tier).toBe('high')
    expect(profile.budgets).toEqual(resolveDeviceTierBudgets('high'))
    expect(profile.score).toBeGreaterThanOrEqual(6)
  })

  it('classifies mixed capability devices into medium tier', () => {
    const profile = detectDeviceTier({
      hardwareConcurrency: 8,
      deviceMemoryGb: 4,
      maxTouchPoints: 0,
      devicePixelRatio: 2,
      viewportWidthPx: 1440,
      viewportHeightPx: 900,
      prefersReducedMotion: false,
    })

    expect(profile.tier).toBe('medium')
    expect(profile.budgets.loadingVisualFpsCap).toBe(45)
  })

  it('classifies constrained compact touch devices into low tier', () => {
    const profile = detectDeviceTier({
      hardwareConcurrency: 4,
      deviceMemoryGb: 2,
      maxTouchPoints: 5,
      devicePixelRatio: 3,
      viewportWidthPx: 430,
      viewportHeightPx: 932,
      prefersReducedMotion: false,
    })

    expect(profile.tier).toBe('low')
    expect(profile.budgets.loadingParticleCount).toBeLessThan(resolveDeviceTierBudgets('medium').loadingParticleCount)
  })

  it('forces low tier for e2e mode', () => {
    const profile = detectDeviceTier({
      hardwareConcurrency: 16,
      deviceMemoryGb: 16,
      devicePixelRatio: 1,
      viewportWidthPx: 1920,
      viewportHeightPx: 1080,
      isE2e: true,
    })

    expect(profile.tier).toBe('low')
    expect(profile.budgets).toEqual(resolveDeviceTierBudgets('low'))
  })
})
