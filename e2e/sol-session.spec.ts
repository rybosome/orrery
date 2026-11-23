import { expect, test } from '@playwright/test'

import { SOL_SCENE } from '../src/scenes/sol.js'

test('real Sol kernels cover every declared body and frame throughout the sampled interval', async ({ page }) => {
  await page.goto('/?e2e=1')
  await page.waitForFunction(() => window.__tspice_viewer__rendered_scene === true)

  const count = await page.evaluate(
    async ({ targets, frame, observer, minUtc, maxUtc, initialEtSec }) => {
      const spice = window.__tspice_viewer__e2e
      if (!spice) throw new Error('Sol worker is unavailable')
      const [minEt, maxEt] = await Promise.all([spice.utcToEt(minUtc), spice.utcToEt(maxUtc)])
      const epochs = [minEt, initialEtSec, (minEt + maxEt) / 2, maxEt]
      for (const at of epochs) {
        for (const { target, bodyFixedFrame } of targets) {
          const position = await spice.getPosition({ target, observer, frame, at })
          if (position.length !== 3 || !position.every(Number.isFinite)) {
            throw new Error(`Invalid Sol position for ${target} at ${at}`)
          }
          if (bodyFixedFrame) {
            const rotation = await spice.getFrameTransform({ from: bodyFixedFrame, to: frame, et: at })
            if (rotation.length !== 9 || !rotation.every(Number.isFinite)) {
              throw new Error(`Invalid Sol orientation for ${bodyFixedFrame} at ${at}`)
            }
          }
        }
      }
      return epochs.length * targets.length
    },
    {
      targets: SOL_SCENE.bodies.map(({ body, bodyFixedFrame }) => ({ target: String(body), bodyFixedFrame })),
      frame: SOL_SCENE.coordinates.frame,
      observer: String(SOL_SCENE.coordinates.observer),
      minUtc: SOL_SCENE.time.minUtc,
      maxUtc: SOL_SCENE.time.maxUtc,
      initialEtSec: SOL_SCENE.time.initialEtSec,
    },
  )
  expect(count).toBe(40)
})

test('a failed kernel load shows a scene error without reporting readiness', async ({ page }) => {
  await page.route('**/naif/lsk/naif0012.tls', (route) => route.abort())
  await page.goto('/?e2e=1')
  await expect(page.getByRole('alert')).toContainText('Could not load Solar System')
  expect(await page.evaluate(() => window.__tspice_viewer__rendered_scene)).toBeFalsy()
})
