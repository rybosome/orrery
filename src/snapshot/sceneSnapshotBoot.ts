import {
  toLoadingTraceErrorMetadata,
  type BootLoadingTrace,
  type BootSnapshotParseOutcome,
} from '../loading/bootLoadingTelemetry.js'

import { measureSnapshotApplyDuration, monotonicNowMs } from './sceneSnapshotAdapter.js'
import { decodeSnapshot, type SceneSnapshotDecodeResult } from './sceneSnapshotCodec.js'
import type { SceneSnapshotV1 } from './sceneSnapshot.js'

export const SNAPSHOT_PATH_PREFIX = '/s/'

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
  trace?: BootLoadingTrace
}

/**
 * Parse a snapshot payload from a pathname that matches `/s/<payload>`.
 *
 * Scope is intentionally narrow for PR2:
 * - exact leading `/s/`
 * - exactly one payload segment (no nested paths)
 */
export function parseSnapshotPayloadFromPathname(pathname: string): string | null {
  if (!pathname.startsWith(SNAPSHOT_PATH_PREFIX)) return null

  const payload = pathname.slice(SNAPSHOT_PATH_PREFIX.length)
  if (!payload) return null
  if (payload.includes('/')) return null

  return payload
}

/** Resolve `/s/<payload>` pathname into either a valid snapshot, invalid payload error, or no-op. */
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
 * Boot-time snapshot loader for `/s/<payload>` links.
 *
 * On invalid payloads, this intentionally does not call `applySnapshot`.
 * Callers keep their existing/default boot state and can show a non-blocking notice.
 */
export async function loadSnapshotFromPathnameAtBoot(
  input: SceneSnapshotBootLoadInput,
): Promise<SceneSnapshotBootLoadResult> {
  const trace = input.trace

  trace?.emit('bootSnapshotParseStarted', {
    pathname: input.pathname,
  })
  const parseStartedAtMs = monotonicNowMs()

  const emitParseCompleted = (outcome: BootSnapshotParseOutcome) => {
    trace?.emit('bootSnapshotParseCompleted', {
      pathname: input.pathname,
      durationMs: monotonicNowMs() - parseStartedAtMs,
      outcome,
    })
  }

  let resolved: SceneSnapshotPathResolution

  try {
    resolved = resolveSnapshotFromPathname(input.pathname, input.decodeSnapshotPayload)
  } catch (error) {
    const metadata = toLoadingTraceErrorMetadata(error)

    trace?.emit('bootSnapshotParseFailed', {
      pathname: input.pathname,
      errorCode: 'exception',
      errorMessage: `${metadata.errorName}: ${metadata.errorMessage}`,
    })

    emitParseCompleted('failed')
    throw error
  }

  if (resolved.kind === 'none') {
    emitParseCompleted('not_found')
    return { status: 'not_found' }
  }

  if (resolved.kind === 'invalid') {
    trace?.emit('bootSnapshotParseFailed', {
      pathname: input.pathname,
      payload: resolved.payload,
      errorCode: resolved.errorCode,
      errorMessage: resolved.errorMessage,
    })
    emitParseCompleted('invalid_payload')

    const invalidResult: Extract<SceneSnapshotBootLoadResult, { status: 'invalid_payload' }> = {
      status: 'invalid_payload',
      payload: resolved.payload,
      errorCode: resolved.errorCode,
      errorMessage: resolved.errorMessage,
    }

    input.onInvalidPayload?.(invalidResult)
    return invalidResult
  }

  emitParseCompleted('valid')

  trace?.emit('bootSnapshotApplyStarted', {
    pathname: input.pathname,
    payload: resolved.payload,
  })

  const applyStartedAtMs = monotonicNowMs()

  try {
    const { result: appliedSnapshot, durationMs } = await measureSnapshotApplyDuration(() =>
      input.applySnapshot(resolved.snapshot),
    )

    trace?.emit('bootSnapshotApplyCompleted', {
      pathname: input.pathname,
      payload: resolved.payload,
      durationMs,
    })

    return {
      status: 'applied',
      payload: resolved.payload,
      snapshot: appliedSnapshot,
    }
  } catch (error) {
    const metadata = toLoadingTraceErrorMetadata(error)

    trace?.emit('bootSnapshotApplyFailed', {
      pathname: input.pathname,
      payload: resolved.payload,
      durationMs: monotonicNowMs() - applyStartedAtMs,
      errorName: metadata.errorName,
      errorMessage: metadata.errorMessage,
    })

    throw error
  }

}
