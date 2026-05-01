import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import type { LoadingConvergencePrimitives } from '../../loading/convergence/index.js'
import type { DeviceTier, DeviceTierBudgets } from '../../loading/deviceTier.js'

type CssVars = CSSProperties & Record<`--${string}`, string | number>

type ProceduralParticle = {
  id: number
  xPct: number
  yPct: number
  sizePx: number
  baseOpacity: number
  driftPx: number
  phaseOffsetRad: number
}

/** Props for the visual-only loading overlay layer. */
export interface LoadingOverlayProps {
  primitives: LoadingConvergencePrimitives
  deviceTier: DeviceTier
  budget: DeviceTierBudgets
}

/**
 * Lightweight instrument-style loading visual layer.
 *
 * The layer is fully non-interactive (`pointer-events: none`) and uses
 * capability-tier budgets to cap update rate + effect complexity.
 */
export function LoadingOverlay({ primitives, deviceTier, budget }: LoadingOverlayProps) {
  const [clockMs, setClockMs] = useState(0)

  const shouldAnimate = primitives.showOverlay

  useEffect(() => {
    if (!shouldAnimate || typeof window === 'undefined') return

    const frameIntervalMs = 1000 / Math.max(1, budget.loadingVisualFpsCap)

    let frameId: number | null = null
    let lastCommitMs = Number.NEGATIVE_INFINITY

    const tick = (nowMs: number) => {
      if (nowMs - lastCommitMs >= frameIntervalMs) {
        lastCommitMs = nowMs
        setClockMs(nowMs)
      }

      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      if (frameId != null) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [budget.loadingVisualFpsCap, shouldAnimate])

  const rings = useMemo(() => Array.from({ length: budget.loadingRingCount }, (_, index) => index), [budget.loadingRingCount])

  const particles = useMemo(
    () => createProceduralParticles(budget.loadingParticleCount),
    [budget.loadingParticleCount],
  )

  if (!primitives.showOverlay && primitives.overlayOpacity <= 0.001) {
    return null
  }

  const clockSec = clockMs / 1000
  const pulse = 0.5 + 0.5 * Math.sin(clockSec * primitives.pulseHz * Math.PI * 2)

  const sweepOrbitDeg = clockSec * (16 + primitives.convergence * 84)
  const sweepAngleDeg = (primitives.sweepAngleDeg + sweepOrbitDeg) % 360

  const layerStyle: CssVars = {
    opacity: primitives.overlayOpacity,
    '--loading-effect-intensity': (budget.loadingEffectIntensity * primitives.glowIntensity).toFixed(4),
    '--loading-scanline-opacity': (primitives.scanlineOpacity * budget.loadingEffectIntensity).toFixed(4),
    '--loading-scanline-count': budget.loadingScanlineCount,
    '--loading-pulse': pulse.toFixed(4),
  }

  const className = [
    'loadingVisualLayer',
    `loadingVisualLayer--${deviceTier}`,
    primitives.hasFailure ? 'loadingVisualLayer--failed' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div aria-hidden className={className} style={layerStyle}>
      <div className="loadingVisualBackdrop" />
      <div className="loadingVisualScanlines" />

      <div className="loadingVisualCore">
        {rings.map((ring, index) => {
          const normalized = (index + 1) / (rings.length + 1)
          const ringTravel = Math.sin(clockSec * (0.35 + normalized * 0.5) + ring * 1.3)
          const diameterPct = 25 + normalized * 58 + ringTravel * 0.9 * primitives.ringCompression

          const ringOpacity =
            (1 - normalized * 0.45) *
            (0.25 + (1 - primitives.convergence) * 0.75) *
            budget.loadingEffectIntensity *
            (0.6 + pulse * 0.4)

          const ringStyle: CSSProperties = {
            width: `${diameterPct.toFixed(2)}%`,
            height: `${diameterPct.toFixed(2)}%`,
            opacity: clamp01(ringOpacity),
            transform: `translate(-50%, -50%) rotate(${(sweepAngleDeg * (0.15 + normalized * 0.65)).toFixed(2)}deg)`,
          }

          return <span key={ring} className="loadingVisualRing" style={ringStyle} />
        })}

        <div
          className="loadingVisualSweep"
          style={{ transform: `translate(-50%, -50%) rotate(${sweepAngleDeg.toFixed(2)}deg)` }}
        />

        <div className="loadingVisualReticle" />
      </div>

      <div className="loadingVisualParticleField">
        {particles.map((particle) => {
          const driftPhase = clockSec * primitives.pulseHz + particle.phaseOffsetRad
          const driftScale = 0.3 + primitives.ringCompression * 0.7
          const driftX = Math.sin(driftPhase) * particle.driftPx * driftScale
          const driftY = Math.cos(driftPhase * 0.82) * particle.driftPx * driftScale

          const opacity = clamp01(
            particle.baseOpacity *
              primitives.particleOpacity *
              budget.loadingEffectIntensity *
              (0.45 + 0.55 * pulse),
          )

          const particleStyle: CSSProperties = {
            left: `${particle.xPct.toFixed(2)}%`,
            top: `${particle.yPct.toFixed(2)}%`,
            width: `${particle.sizePx.toFixed(2)}px`,
            height: `${particle.sizePx.toFixed(2)}px`,
            opacity,
            transform: `translate3d(${driftX.toFixed(2)}px, ${driftY.toFixed(2)}px, 0)`,
          }

          return <span key={particle.id} className="loadingVisualParticle" style={particleStyle} />
        })}
      </div>
    </div>
  )
}

function createProceduralParticles(count: number): ProceduralParticle[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, index) => {
    const seed = index + 1
    const xPct = 18 + hash01(seed * 19.17) * 64
    const yPct = 16 + hash01(seed * 41.29) * 68

    return {
      id: index,
      xPct,
      yPct,
      sizePx: 1.2 + hash01(seed * 11.13) * 2.8,
      baseOpacity: 0.2 + hash01(seed * 7.77) * 0.6,
      driftPx: 2 + hash01(seed * 5.31) * 8,
      phaseOffsetRad: hash01(seed * 13.37) * Math.PI * 2,
    }
  })
}

function hash01(value: number): number {
  const x = Math.sin(value * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
