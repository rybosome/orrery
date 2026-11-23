/**
 * Zoom-dependent default playback rate.
 *
 * The zoom UI is a log-scale curve mapped onto a slider in [0..100].
 * The first third of that curve should default to 1 hour/s,
 * and the remaining two thirds to 1 day/s. The weekly rate remains available
 * as an explicit playback rate in the time store.
 */

export const DEFAULT_RESUME_RATE_HOUR_SEC_PER_SEC = 60 * 60
export const DEFAULT_RESUME_RATE_DAY_SEC_PER_SEC = 24 * 60 * 60
export const DEFAULT_RESUME_RATE_WEEK_SEC_PER_SEC = 7 * DEFAULT_RESUME_RATE_DAY_SEC_PER_SEC

const ZOOM_SLIDER_ONE_THIRD = 100 / 3
/**
 * Compute the default resume/playback rate for a given zoom slider position.
 *
 * Note: `zoomSlider` is treated as the zoom curve value in [0..100].
 */
export function computeDefaultResumeRateSecPerSecForZoomSlider(
  zoomSlider: number,
  rates = {
    closeSecPerSec: DEFAULT_RESUME_RATE_HOUR_SEC_PER_SEC,
    wideSecPerSec: DEFAULT_RESUME_RATE_DAY_SEC_PER_SEC,
  },
): number {
  const zoom = Math.max(0, Math.min(100, zoomSlider))
  return zoom < ZOOM_SLIDER_ONE_THIRD ? rates.closeSecPerSec : rates.wideSecPerSec
}
