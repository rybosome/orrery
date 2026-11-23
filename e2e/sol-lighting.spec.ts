import { expect, test } from '@playwright/test'

test('standard and terminator lighting stay aligned as the real scene is rebased', async ({ page }) => {
  await page.goto('/?e2e=1&testScene=1&et=1234567')
  await page.waitForFunction(() => window.__tspice_viewer__rendered_scene === true, undefined, { timeout: 15_000 })

  const result = await page.evaluate(async () => {
    const api = window.__tspice_viewer__e2e
    if (!api?.sampleBodyLighting) throw new Error('Lighting probe is unavailable')
    const body = 'REFERENCE_PLANET'
    return {
      atPlanet: await api.sampleBodyLighting(body, body),
      atMars: await api.sampleBodyLighting(body, 'MARS'),
      atStar: await api.sampleBodyLighting(body, 'SUN'),
    }
  })

  // Read the framebuffer from the actual point-lit, terminator-shaded surface.
  // The probe keeps its orientation relative to the planet and star for each view.
  expect(result.atPlanet.lit - result.atPlanet.dark).toBeGreaterThan(25)
  for (const sample of [result.atMars, result.atStar]) {
    expect(Math.abs(sample.lit - result.atPlanet.lit)).toBeLessThanOrEqual(3)
    expect(Math.abs(sample.dark - result.atPlanet.dark)).toBeLessThanOrEqual(3)
  }
})
