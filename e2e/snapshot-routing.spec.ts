import { expect, test, type Page } from '@playwright/test'

import { V1_MARS_VIEW_PAYLOAD } from '../src/snapshot/fixtures/v1SolViews.js'

async function expectSnapshotDeepLinkLoaded(pathname: string, page: Page): Promise<void> {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []

  page.on('pageerror', (err) => {
    pageErrors.push(String(err))
  })

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  await page.goto(pathname)
  await page.waitForFunction(() => window.__tspice_viewer__rendered_scene === true)

  await expect(page.getByRole('heading', { name: 'Orrery' })).toBeVisible()
  await expect(page.getByText('Invalid shared snapshot URL. Loaded default scene state instead.')).toHaveCount(0)

  await expect(page.getByText('Focus Body: MARS', { exact: true })).toBeVisible()

  expect(pageErrors, `pageerror events:\n${pageErrors.join('\n')}`).toEqual([])
  expect(consoleErrors, `console.error messages:\n${consoleErrors.join('\n')}`).toEqual([])
}

test('snapshot deep-link loads from canonical bare-root path', async ({ page }) => {
  await expectSnapshotDeepLinkLoaded(`/${V1_MARS_VIEW_PAYLOAD}?e2e=1`, page)
})

test('snapshot deep-link still loads from legacy /s path', async ({ page }) => {
  await expectSnapshotDeepLinkLoaded(`/s/${V1_MARS_VIEW_PAYLOAD}?e2e=1`, page)
})

test('static asset endpoint remains unaffected by snapshot rewrites', async ({ request }) => {
  const response = await request.get('/static/kernels/naif/lsk/naif0012.tls')
  expect(response.status()).toBe(200)

  const text = await response.text()
  expect(text.startsWith('KPL/LSK')).toBe(true)
})
