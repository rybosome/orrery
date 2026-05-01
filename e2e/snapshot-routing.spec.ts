import { expect, test, type Page } from '@playwright/test'

import { encodeSnapshot } from '../src/snapshot/sceneSnapshotCodec.js'
import { createDefaultSceneSnapshotV1 } from '../src/snapshot/sceneSnapshot.js'

function createSnapshotPayloadForRoutingTests(): string {
  const base = createDefaultSceneSnapshotV1()
  const snapshot = {
    ...base,
    focusBody: 'MARS' as const,
    system: {
      ...base.system,
      showRenderHud: true,
    },
  }

  return encodeSnapshot(snapshot)
}

const ROUTING_TEST_PAYLOAD = createSnapshotPayloadForRoutingTests()

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
  await page.waitForLoadState('domcontentloaded')

  await expect(page.getByRole('heading', { name: 'Orrery' })).toBeVisible()
  await expect(page.getByText('Invalid shared snapshot URL. Loaded default scene state instead.')).toHaveCount(0)

  expect(pageErrors, `pageerror events:\n${pageErrors.join('\n')}`).toEqual([])
  expect(consoleErrors, `console.error messages:\n${consoleErrors.join('\n')}`).toEqual([])
}

test('snapshot deep-link loads from canonical bare-root path', async ({ page }) => {
  await expectSnapshotDeepLinkLoaded(`/${ROUTING_TEST_PAYLOAD}`, page)
})

test('snapshot deep-link still loads from legacy /s path', async ({ page }) => {
  await expectSnapshotDeepLinkLoaded(`/s/${ROUTING_TEST_PAYLOAD}`, page)
})

test('static asset endpoint remains unaffected by snapshot rewrites', async ({ request }) => {
  const response = await request.get('/static/kernels/naif/lsk/naif0012.tls')
  expect(response.status()).toBe(200)

  const text = await response.text()
  expect(text.startsWith('KPL/LSK')).toBe(true)
})
