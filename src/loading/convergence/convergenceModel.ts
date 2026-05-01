import { LOADING_PHASE_ORDER, type LoadingPhase, type LoadingState } from '../loadingStore.js'

/**
 * Tuning knobs for the loading convergence primitive model.
 *
 * Kept as a plain data bag so follow-up preset work can safely swap values
 * without changing call sites.
 */
export interface ConvergencePrimitiveTuning {
  /** Exponent applied before easing; lower values front-load progress. */
  readinessExponent: number

  /** Readiness threshold where the visual handoff fade starts. */
  fadeStartReadiness: number

  /** Readiness threshold where the visual handoff fade is fully complete. */
  fadeEndReadiness: number

  /** Minimum pulse frequency for instrument layers. */
  minPulseHz: number

  /** Maximum pulse frequency for instrument layers. */
  maxPulseHz: number

  /** Maximum sweep revolutions accumulated by full convergence. */
  maxSweepTurns: number
}

/** Input snapshot accepted by `computeConvergencePrimitives`. */
export interface ConvergencePrimitiveInput {
  phase: LoadingPhase
  readinessValue: number
  hasFailure: boolean
}

/**
 * Procedural primitives consumed by the loading visual layer.
 */
export interface LoadingConvergencePrimitives {
  phase: LoadingPhase
  readiness: number
  phaseProgress: number
  convergence: number
  handoff: number
  overlayOpacity: number
  ringCompression: number
  particleOpacity: number
  scanlineOpacity: number
  glowIntensity: number
  pulseHz: number
  sweepAngleDeg: number
  hasFailure: boolean
  showOverlay: boolean
}

/** Default tuning profile for PR6 convergence visuals. */
export const DEFAULT_CONVERGENCE_PRIMITIVE_TUNING: ConvergencePrimitiveTuning = {
  readinessExponent: 0.92,
  fadeStartReadiness: 0.82,
  fadeEndReadiness: 0.995,
  minPulseHz: 0.45,
  maxPulseHz: 2.2,
  maxSweepTurns: 3.25,
}

/**
 * Resolve a complete tuning profile from optional overrides.
 */
export function resolveConvergencePrimitiveTuning(
  overrides: Partial<ConvergencePrimitiveTuning> = {},
): ConvergencePrimitiveTuning {
  const readinessExponent = sanitizePositive(overrides.readinessExponent, DEFAULT_CONVERGENCE_PRIMITIVE_TUNING.readinessExponent)

  const fadeStartReadiness = clamp01(
    overrides.fadeStartReadiness ?? DEFAULT_CONVERGENCE_PRIMITIVE_TUNING.fadeStartReadiness,
  )

  const fadeEndReadiness = clamp01(overrides.fadeEndReadiness ?? DEFAULT_CONVERGENCE_PRIMITIVE_TUNING.fadeEndReadiness)

  const minPulseHz = sanitizePositive(overrides.minPulseHz, DEFAULT_CONVERGENCE_PRIMITIVE_TUNING.minPulseHz)
  const maxPulseHz = sanitizePositive(overrides.maxPulseHz, DEFAULT_CONVERGENCE_PRIMITIVE_TUNING.maxPulseHz)

  const maxSweepTurns = sanitizePositive(overrides.maxSweepTurns, DEFAULT_CONVERGENCE_PRIMITIVE_TUNING.maxSweepTurns)

  return {
    readinessExponent,
    fadeStartReadiness,
    fadeEndReadiness: Math.max(fadeStartReadiness, fadeEndReadiness),
    minPulseHz: Math.min(minPulseHz, maxPulseHz),
    maxPulseHz: Math.max(minPulseHz, maxPulseHz),
    maxSweepTurns,
  }
}

/**
 * Map loading readiness/phase into procedural convergence primitives.
 */
export function computeConvergencePrimitives(
  input: ConvergencePrimitiveInput,
  tuning: Partial<ConvergencePrimitiveTuning> = {},
): LoadingConvergencePrimitives {
  const resolvedTuning = resolveConvergencePrimitiveTuning(tuning)

  const readiness = clamp01(input.readinessValue)
  const phaseProgress = computePhaseProgress(input.phase)

  // Blend readiness with phase progress so visuals remain monotonic even when
  // subsystem readiness lags behind an already-advanced phase.
  const blendedProgress = clamp01(Math.max(readiness, phaseProgress * 0.9))
  const easedConvergence = easeOutCubic(Math.pow(blendedProgress, resolvedTuning.readinessExponent))

  const handoff = input.hasFailure
    ? 1
    : 1 - smoothstep(resolvedTuning.fadeStartReadiness, resolvedTuning.fadeEndReadiness, blendedProgress)

  const baseOpacity =
    0.14 +
    (1 - easedConvergence) * 0.58 +
    (1 - phaseProgress) * 0.14 +
    (input.hasFailure ? 0.2 : 0)

  const overlayOpacity = clamp01(baseOpacity * handoff)

  const ringCompression = clamp01(1 - easedConvergence)
  const particleOpacity = clamp01(0.2 + (1 - easedConvergence) * 0.8)
  const scanlineOpacity = clamp01(0.08 + (1 - easedConvergence) * 0.3)
  const glowIntensity = clamp01(0.2 + (1 - easedConvergence) * 0.8)

  const pulseLerp = Math.sqrt(easedConvergence)
  const pulseHz = lerp(resolvedTuning.minPulseHz, resolvedTuning.maxPulseHz, pulseLerp)

  const sweepTurns = phaseProgress * 0.7 + easedConvergence * resolvedTuning.maxSweepTurns
  const sweepAngleDeg = (sweepTurns * 360) % 360

  const showOverlay = input.hasFailure || input.phase !== 'ready' || overlayOpacity > 0.015

  return {
    phase: input.phase,
    readiness,
    phaseProgress,
    convergence: easedConvergence,
    handoff,
    overlayOpacity,
    ringCompression,
    particleOpacity,
    scanlineOpacity,
    glowIntensity,
    pulseHz,
    sweepAngleDeg,
    hasFailure: input.hasFailure,
    showOverlay,
  }
}

/**
 * Convenience mapping from loading-store state snapshots.
 */
export function mapLoadingStateToConvergencePrimitives(
  state: Pick<LoadingState, 'phase' | 'failure' | 'readiness'>,
  tuning: Partial<ConvergencePrimitiveTuning> = {},
): LoadingConvergencePrimitives {
  return computeConvergencePrimitives(
    {
      phase: state.phase,
      readinessValue: state.readiness.value,
      hasFailure: state.failure != null,
    },
    tuning,
  )
}

function computePhaseProgress(phase: LoadingPhase): number {
  const phaseIndex = LOADING_PHASE_ORDER.indexOf(phase)
  if (phaseIndex < 0) return 0

  const maxIndex = LOADING_PHASE_ORDER.length - 1
  if (maxIndex <= 0) return 1

  return clamp01(phaseIndex / maxIndex)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function sanitizePositive(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  if (value <= 0) return fallback
  return value
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function easeOutCubic(value: number): number {
  const t = clamp01(value)
  return 1 - Math.pow(1 - t, 3)
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * clamp01(t)
}
