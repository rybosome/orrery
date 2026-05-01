import { writeFile } from 'node:fs/promises'

import type { Page, TestInfo } from '@playwright/test'

/** Baseline profile bucket used by diagnostics output. */
export type BaselineProfile = 'desktop' | 'mobile'

/** Run kind used for startup baseline comparison. */
export type BaselineRunType = 'cold' | 'warm'

type CollectBootBaselineSampleArgs = {
  page: Page
  testInfo: TestInfo
  scenario: string
  runType: BaselineRunType
  profile?: BaselineProfile
  tags?: readonly string[]
  metadata?: Record<string, unknown>
}

type CollectColdWarmBootBaselinePairArgs = Omit<CollectBootBaselineSampleArgs, 'runType'> & {
  waitForReady: () => Promise<void>
}

/**
 * Infer a baseline profile from the active Playwright project name.
 */
export function inferBaselineProfile(projectName: string): BaselineProfile {
  return /mobile|iphone|android|ipad/i.test(projectName) ? 'mobile' : 'desktop'
}

/**
 * Collect, persist, and emit one machine-readable boot baseline sample.
 */
export async function collectBootBaselineSample(args: CollectBootBaselineSampleArgs) {
  const profile = args.profile ?? inferBaselineProfile(args.testInfo.project.name)

  const sample = await args.page.evaluate(
    ({ profile, runType, scenario, tags, metadata }) => {
      const api = window.__tspice_viewer__e2e
      const collected =
        api?.collectBootBaseline?.({
          profile,
          runType,
          scenario,
          tags,
          metadata: metadata as Record<string, unknown> | undefined,
        }) ?? null

      if (collected != null) return collected

      const diagnostics = api?.getBootDiagnostics?.() ?? window.__tspice_viewer__boot_diagnostics ?? null
      if (diagnostics == null) return null

      return {
        schemaVersion: 1,
        runSequence: window.__tspice_viewer__boot_run_sequence ?? 0,
        sampleIndex: (window.__tspice_viewer__boot_baselines?.length ?? 0) + 1,
        profile,
        runType,
        scenario,
        tags: [...(tags ?? [])],
        collectedAtEpochMs: Date.now(),
        diagnostics,
        ...(metadata ? { metadata } : {}),
      }
    },
    {
      profile,
      runType: args.runType,
      scenario: args.scenario,
      tags: args.tags ?? [],
      metadata: args.metadata,
    },
  )

  if (sample == null) return null

  const safeScenario = sanitizeForFilename(args.scenario)
  const filePath = args.testInfo.outputPath(`boot-baseline-${safeScenario}-${profile}-${args.runType}.json`)
  const json = JSON.stringify(sample)

  await writeFile(filePath, `${json}\n`, 'utf8')

  await args.testInfo.attach(`boot-baseline:${args.scenario}:${profile}:${args.runType}`, {
    path: filePath,
    contentType: 'application/json',
  })

  console.log(`[boot-baseline-json] ${json}`)

  return sample
}

/**
 * Collect cold + warm startup baseline samples for one scenario.
 */
export async function collectColdWarmBootBaselinePair(args: CollectColdWarmBootBaselinePairArgs) {
  await args.waitForReady()
  const cold = await collectBootBaselineSample({
    ...args,
    runType: 'cold',
  })

  await args.page.reload({ waitUntil: 'domcontentloaded' })

  await args.waitForReady()
  const warm = await collectBootBaselineSample({
    ...args,
    runType: 'warm',
  })

  return { cold, warm }
}

function sanitizeForFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
