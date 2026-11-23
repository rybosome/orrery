import { expect, test, type Page } from '@playwright/test'

import { V1_MARS_VIEW_PAYLOAD } from '../src/snapshot/fixtures/v1SolViews.js'
import { V2_SOL_MARS_VIEW_PAYLOAD } from '../src/snapshot/fixtures/v2SolViews.js'

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

test('a direct Sol v2 share restores the saved view', async ({ page }) => {
  await expectSnapshotDeepLinkLoaded(`/sol/s/${V2_SOL_MARS_VIEW_PAYLOAD}?e2e=1`, page)
})

test('Sol has an ordinary scene route and explicit invalid share fallback', async ({ page }) => {
  await page.goto('/sol?e2e=1')
  await page.waitForFunction(() => window.__tspice_viewer__rendered_scene === true)
  await expect(page.getByRole('status')).toHaveCount(0)

  await page.goto('/sol/s/bad?e2e=1')
  await expect(page.getByRole('status')).toContainText('Invalid shared snapshot URL')
})

test('an unregistered scene shows a link to Sol', async ({ page }) => {
  await page.goto('/trappist-1')
  await expect(page.getByRole('heading', { name: 'Unknown scene' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open the Solar System' })).toHaveAttribute('href', '/sol')
})
