import {
  listBodyRegistryEntriesForSceneBodies,
  type BodyId,
  type BodyRegistryEntry,
} from '../scene/BodyRegistry.js'
import { isEarthAppearanceLayer, type SceneBody } from '../scene/SceneModel.js'

import type { BootTextureAssetKind } from './bootLoadingTelemetry.js'

export const STARTUP_ASSET_REQUIRED_POLICY_V1 = 'v1_all_startup_assets_required' as const

export type StartupAssetRequiredPolicy = typeof STARTUP_ASSET_REQUIRED_POLICY_V1

/** Deterministic descriptor for one startup asset needed by a body. */
export interface StartupAssetManifestAsset {
  assetId: string
  bodyId: BodyId
  assetKind: BootTextureAssetKind
  url: string
  required: boolean
}

/** Startup assets grouped by body identity. */
export interface StartupAssetManifestBody {
  bodyId: BodyId
  assets: readonly StartupAssetManifestAsset[]
}

/** Full deterministic startup-asset manifest. */
export interface StartupAssetManifest {
  requiredPolicy: StartupAssetRequiredPolicy
  assets: readonly StartupAssetManifestAsset[]
  bodies: readonly StartupAssetManifestBody[]
}

export type StartupAssetCompletionInput = {
  completedAssetIds?: Iterable<string>
  failedAssetIds?: Iterable<string>
}

export type StartupAssetCompletionAccounting = {
  total: number
  required: number
  completed: number
  failed: number
  pending: number
  readinessRatio: number
}

type StartupAssetManifestSourceEntry = Pick<BodyRegistryEntry, 'id' | 'style'>

/**
 * v1 required policy: every startup asset listed in the manifest is required.
 */
export function isStartupAssetRequiredV1(_asset: {
  bodyId: BodyId
  assetKind: BootTextureAssetKind
  url: string
}): boolean {
  return true
}

/** Build a deterministic startup-asset manifest from scene body entries. */
export function buildStartupAssetManifestFromBodyRegistryEntries(
  entries: readonly StartupAssetManifestSourceEntry[],
): StartupAssetManifest {
  const manifestBodies: StartupAssetManifestBody[] = []
  const manifestAssets: StartupAssetManifestAsset[] = []

  for (const entry of entries) {
    const bodyAssets = listStartupAssetsForBody(entry)

    manifestBodies.push({
      bodyId: entry.id,
      assets: bodyAssets,
    })

    manifestAssets.push(...bodyAssets)
  }

  return {
    requiredPolicy: STARTUP_ASSET_REQUIRED_POLICY_V1,
    assets: manifestAssets,
    bodies: manifestBodies,
  }
}

/**
 * Build a deterministic startup-asset manifest from scene bodies by resolving
 * each body against the registry.
 */
export function buildStartupAssetManifestFromSceneBodies(sceneBodies: readonly SceneBody[]): StartupAssetManifest {
  return buildStartupAssetManifestFromBodyRegistryEntries(listBodyRegistryEntriesForSceneBodies(sceneBodies))
}

/** Stable ordered list of manifest asset IDs. */
export function listStartupAssetIds(manifest: Pick<StartupAssetManifest, 'assets'>): readonly string[] {
  return manifest.assets.map((asset) => asset.assetId)
}

/**
 * Compute aggregate startup-asset completion accounting.
 *
 * Any listed asset ID not present in either `completedAssetIds` or
 * `failedAssetIds` is counted as `pending`.
 */
export function computeStartupAssetCompletionAccounting(
  manifest: Pick<StartupAssetManifest, 'assets'>,
  input: StartupAssetCompletionInput = {},
): StartupAssetCompletionAccounting {
  const completedIds = new Set(input.completedAssetIds)
  const failedIds = new Set(input.failedAssetIds)

  let total = 0
  let required = 0
  let completed = 0
  let failed = 0
  let pending = 0
  let requiredCompleted = 0

  for (const asset of manifest.assets) {
    total += 1
    if (asset.required) required += 1

    const isCompleted = completedIds.has(asset.assetId)
    const isFailed = !isCompleted && failedIds.has(asset.assetId)

    if (isCompleted) {
      completed += 1
      if (asset.required) requiredCompleted += 1
      continue
    }

    if (isFailed) {
      failed += 1
      continue
    }

    pending += 1
  }

  return {
    total,
    required,
    completed,
    failed,
    pending,
    readinessRatio: required > 0 ? requiredCompleted / required : 1,
  }
}

function listStartupAssetsForBody(entry: StartupAssetManifestSourceEntry): StartupAssetManifestAsset[] {
  const bodyId = entry.id
  const assets: StartupAssetManifestAsset[] = []
  const surface = entry.style.appearance.surface

  const addAsset = (assetKind: BootTextureAssetKind, url: string) => {
    assets.push({
      assetId: toStartupAssetId(bodyId, assetKind, url),
      bodyId,
      assetKind,
      url,
      required: isStartupAssetRequiredV1({ bodyId, assetKind, url }),
    })
  }

  if (surface.texture?.url) {
    addAsset('surfaceMap', surface.texture.url)
  }

  if (surface.normalTexture?.url) {
    addAsset('normalMap', surface.normalTexture.url)
  }

  if (surface.roughnessTexture?.url) {
    addAsset('roughnessMap', surface.roughnessTexture.url)
  }

  if (entry.style.appearance.rings?.textureUrl) {
    addAsset('ringMap', entry.style.appearance.rings.textureUrl)
  }

  const earthLayer = entry.style.appearance.layers?.find(isEarthAppearanceLayer)

  if (earthLayer?.earth.nightLightsTextureUrl) {
    addAsset('earthNightLightsMap', earthLayer.earth.nightLightsTextureUrl)
  }

  if (earthLayer?.earth.cloudsTextureUrl) {
    addAsset('earthCloudsMap', earthLayer.earth.cloudsTextureUrl)
  }

  if (earthLayer?.earth.waterMaskTextureUrl) {
    addAsset('earthWaterMaskMap', earthLayer.earth.waterMaskTextureUrl)
  }

  return assets
}

function toStartupAssetId(bodyId: BodyId, assetKind: BootTextureAssetKind, url: string): string {
  return `${bodyId}:${assetKind}:${url}`
}
