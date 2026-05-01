import { decodeSnapshot, type SceneSnapshotDecodeResult } from './sceneSnapshotCodec.js'
import type { SceneSnapshotV1 } from './sceneSnapshot.js'

export const SNAPSHOT_CANONICAL_PATH_PREFIX = '/'
export const SNAPSHOT_LEGACY_PATH_PREFIX = '/s/'

type SnapshotDecodeErrorCode = Extract<SceneSnapshotDecodeResult, { ok: false }>['error']['code']

export type SceneSnapshotPathResolution =
  | { kind: 'none' }
  | {
      kind: 'invalid'
      payload: string
      errorCode: SnapshotDecodeErrorCode
      errorMessage: string
    }
  | {
      kind: 'valid'
      payload: string
      snapshot: SceneSnapshotV1
    }

export type SceneSnapshotBootLoadResult =
  | { status: 'not_found' }
  | {
      status: 'invalid_payload'
      payload: string
      errorCode: SnapshotDecodeErrorCode
      errorMessage: string
    }
  | {
      status: 'applied'
      payload: string
      snapshot: SceneSnapshotV1
    }

export type SceneSnapshotBootLoadInput = {
  pathname: string
  applySnapshot: (snapshot: SceneSnapshotV1) => Promise<SceneSnapshotV1> | SceneSnapshotV1
  decodeSnapshotPayload?: (payload: string) => SceneSnapshotDecodeResult
  onInvalidPayload?: (result: Extract<SceneSnapshotBootLoadResult, { status: 'invalid_payload' }>) => void
}

/**
 * Parse a snapshot payload from a pathname.
 *
 * Supported path shapes during the compatibility window:
 * - `/<payload>` (canonical)
 * - `/s/<payload>` (legacy)
 *
 * Both variants require exactly one payload segment (no nested paths).
 */
export function parseSnapshotPayloadFromPathname(pathname: string): string | null {
  const legacyPayload = parseLegacySnapshotPayloadFromPathname(pathname)
  if (legacyPayload) return legacyPayload

  return parseCanonicalSnapshotPayloadFromPathname(pathname)
}

function parseCanonicalSnapshotPayloadFromPathname(pathname: string): string | null {
  if (!pathname.startsWith(SNAPSHOT_CANONICAL_PATH_PREFIX)) return null

  const payload = pathname.slice(SNAPSHOT_CANONICAL_PATH_PREFIX.length)
  return parseSnapshotPayloadSegment(payload)
}

function parseLegacySnapshotPayloadFromPathname(pathname: string): string | null {
  if (!pathname.startsWith(SNAPSHOT_LEGACY_PATH_PREFIX)) return null

  const payload = pathname.slice(SNAPSHOT_LEGACY_PATH_PREFIX.length)
  return parseSnapshotPayloadSegment(payload)
}

function parseSnapshotPayloadSegment(payload: string): string | null {
  if (!payload) return null
  if (payload.includes('/')) return null

  return payload
}

/** Resolve snapshot pathname (`/<payload>` or `/s/<payload>`) into valid/invalid/no-op. */
export function resolveSnapshotFromPathname(
  pathname: string,
  decodeSnapshotPayload: (payload: string) => SceneSnapshotDecodeResult = decodeSnapshot,
): SceneSnapshotPathResolution {
  const payload = parseSnapshotPayloadFromPathname(pathname)
  if (!payload) return { kind: 'none' }

  const decoded = decodeSnapshotPayload(payload)
  if (!decoded.ok) {
    return {
      kind: 'invalid',
      payload,
      errorCode: decoded.error.code,
      errorMessage: decoded.error.message,
    }
  }

  return {
    kind: 'valid',
    payload,
    snapshot: decoded.snapshot,
  }
}

/**
 * Boot-time snapshot loader for snapshot links (`/<payload>` + legacy `/s/<payload>`).
 *
 * On invalid payloads, this intentionally does not call `applySnapshot`.
 * Callers keep their existing/default boot state and can show a non-blocking notice.
 */
export async function loadSnapshotFromPathnameAtBoot(
  input: SceneSnapshotBootLoadInput,
): Promise<SceneSnapshotBootLoadResult> {
  const resolved = resolveSnapshotFromPathname(input.pathname, input.decodeSnapshotPayload)
  if (resolved.kind === 'none') {
    return { status: 'not_found' }
  }

  if (resolved.kind === 'invalid') {
    const invalidResult: Extract<SceneSnapshotBootLoadResult, { status: 'invalid_payload' }> = {
      status: 'invalid_payload',
      payload: resolved.payload,
      errorCode: resolved.errorCode,
      errorMessage: resolved.errorMessage,
    }

    input.onInvalidPayload?.(invalidResult)
    return invalidResult
  }

  const appliedSnapshot = await input.applySnapshot(resolved.snapshot)
  return {
    status: 'applied',
    payload: resolved.payload,
    snapshot: appliedSnapshot,
  }
}
