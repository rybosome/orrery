import { describe, expect, it, vi } from 'vitest'

import { computeViewerScrubRangeEt } from './viewerTimeBounds.js'

const time = { minUtc: '2026-01-01T00:00:00Z', maxUtc: '2026-01-02T00:00:00Z' }

describe('viewerTimeBounds', () => {
  it('converts the scene endpoints to ET with the loaded kernel client', async () => {
    const utcToEt = vi.fn<(utc: string) => Promise<number>>().mockResolvedValueOnce(1.23).mockResolvedValueOnce(100.56)
    await expect(computeViewerScrubRangeEt({ spice: { kit: { utcToEt } }, time })).resolves.toEqual({
      minEtSec: 1.23,
      maxEtSec: 100.56,
    })
    expect(utcToEt.mock.calls).toEqual([[time.minUtc], [time.maxUtc]])
  })

  it('surfaces failed kernel conversions', async () => {
    const utcToEt = vi.fn().mockRejectedValue(new Error('missing leap seconds kernel'))
    await expect(computeViewerScrubRangeEt({ spice: { kit: { utcToEt } }, time })).rejects.toThrow(
      'missing leap seconds kernel',
    )
  })

  it('rejects a collapsed ET interval', async () => {
    const utcToEt = async () => 100
    await expect(computeViewerScrubRangeEt({ spice: { kit: { utcToEt } }, time })).rejects.toThrow(
      'increasing ET interval',
    )
  })
})
