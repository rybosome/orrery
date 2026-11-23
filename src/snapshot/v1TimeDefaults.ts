/**
 * Default scrub window: 10 years from J2000 epoch (0 to ~10 years in seconds).
 * ET = 0 corresponds to 2000-01-01T12:00:00 TDB.
 */
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60
export const DEFAULT_SCRUB_MIN_ET_SEC = 0
export const DEFAULT_SCRUB_MAX_ET_SEC = 10 * SECONDS_PER_YEAR // ~315,576,000 seconds

/** Default quantum for ET quantization (0.1 seconds = 100ms). */
export const DEFAULT_QUANTUM_SEC = 0.1

/** Default step size for step forward/back (60 seconds). */
export const DEFAULT_STEP_SEC = 60
