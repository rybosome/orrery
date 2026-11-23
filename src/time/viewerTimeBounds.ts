import type { SceneTimeDefinition } from '../scenes/sceneDefinition.js'

type UtcToEtSpice = {
  kit: { utcToEt: (utc: string) => Promise<number> }
}

/** Convert the declared endpoints with the session's loaded leap seconds kernel. */
export async function computeViewerScrubRangeEt({
  spice,
  time,
}: {
  spice: UtcToEtSpice
  time: Pick<SceneTimeDefinition, 'minUtc' | 'maxUtc'>
}): Promise<{ minEtSec: number; maxEtSec: number }> {
  const [minEtSec, maxEtSec] = await Promise.all([spice.kit.utcToEt(time.minUtc), spice.kit.utcToEt(time.maxUtc)])
  if (!Number.isFinite(minEtSec) || !Number.isFinite(maxEtSec) || minEtSec >= maxEtSec) {
    throw new Error('The declared UTC coverage does not convert to an increasing ET interval')
  }
  return { minEtSec, maxEtSec }
}
