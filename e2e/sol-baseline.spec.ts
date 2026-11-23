import { expect, test } from '@playwright/test'

test('Sol boots focused on Earth with the original body roster and assets', async ({ page }) => {
  const assetPaths = new Set([
    '/static/backend-wasm/dist/tspice_backend_wasm.wasm',
    '/static/kernels/naif/lsk/naif0012.tls',
    '/static/kernels/naif/pck/pck00011.tpc',
    '/static/kernels/naif/spk/planets/de432s.bsp',
    '/static/textures/planets/earth.png',
  ])
  const servedAssets = new Set<string>()
  page.on('response', (response) => {
    const { pathname } = new URL(response.url())
    if (response.ok() && assetPaths.has(pathname)) servedAssets.add(pathname)
  })

  await page.goto('/?e2e=1&et=1234567')
  await page.waitForFunction(() => window.__tspice_viewer__rendered_scene === true)
  await expect.poll(() => servedAssets).toEqual(assetPaths)

  await page.getByRole('button', { name: 'Expand controls' }).click()
  await page.getByRole('tab', { name: 'GUIDES', exact: true }).click()

  const focus = page.getByRole('combobox')
  await expect(focus).toHaveValue('EARTH')
  await expect(focus.getByRole('option')).toHaveText([
    'Sun',
    'Mercury',
    'Venus',
    'Earth',
    'Mars',
    'Jupiter',
    'Saturn',
    'Uranus',
    'Neptune',
    'Moon',
  ])
})
