import { deflateSync, inflateSync } from 'fflate'

import { SCENE_SNAPSHOT_SCHEMA_VERSION, normalizeSceneSnapshot, type SceneSnapshotV1 } from './sceneSnapshot.js'

type SnapshotDecodeErrorCode = 'invalid_payload' | 'decompression_failed' | 'invalid_json' | 'unsupported_version'

type DecodeFailure = {
  ok: false
  error: { code: SnapshotDecodeErrorCode; message: string }
}

export type SceneSnapshotDecodeResult = { ok: true; snapshot: SceneSnapshotV1 } | DecodeFailure

const SNAPSHOT_DEFLATE_LEVEL = 9

function bytesToBinaryString(bytes: Uint8Array): string {
  let out = ''

  // Keep chunks small enough to avoid spread-arg size limits.
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    out += String.fromCharCode(...chunk)
  }

  return out
}

function binaryStringToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function encodeBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(bytesToBinaryString(bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(payload: string): Uint8Array {
  const trimmed = payload.trim()
  if (!trimmed) throw new Error('snapshot payload is empty')

  if (/[^A-Za-z0-9_-]/.test(trimmed)) {
    throw new Error('snapshot payload contains invalid base64url characters')
  }

  const base64 = trimmed.replace(/-/g, '+').replace(/_/g, '/')
  const remainder = base64.length % 4
  if (remainder === 1) {
    throw new Error('snapshot payload has invalid base64url length')
  }

  const padded = remainder === 0 ? base64 : `${base64}${'='.repeat(4 - remainder)}`
  return binaryStringToBytes(atob(padded))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** Compress a versioned snapshot document into its URL-safe representation. */
export function encodeSnapshotDocument(document: object): string {
  const json = JSON.stringify(document)
  const compressed = deflateSync(new TextEncoder().encode(json), { level: SNAPSHOT_DEFLATE_LEVEL })
  return encodeBase64Url(compressed)
}

/** Decode the shared wire format before validating a specific snapshot version. */
export function decodeSnapshotDocument(payload: string): { ok: true; document: unknown } | DecodeFailure {
  let compressed: Uint8Array
  try {
    if (payload.length > 16_384) throw new Error('snapshot payload is too long')
    compressed = decodeBase64Url(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid snapshot payload'
    return {
      ok: false,
      error: {
        code: 'invalid_payload',
        message,
      },
    }
  }

  let jsonBytes: Uint8Array
  try {
    const out = new Uint8Array(32_768)
    jsonBytes = inflateSync(compressed, { out })
    if (jsonBytes.length === out.length) throw new Error('snapshot document is too large')
  } catch {
    return {
      ok: false,
      error: {
        code: 'decompression_failed',
        message: 'snapshot payload decompression failed',
      },
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(jsonBytes))
  } catch {
    return {
      ok: false,
      error: {
        code: 'invalid_json',
        message: 'snapshot payload JSON parse failed',
      },
    }
  }

  return { ok: true, document: parsed }
}

/** Decode and validate a compressed v1 snapshot payload with the original defaults. */
export function decodeSnapshot(payload: string): SceneSnapshotDecodeResult {
  const decoded = decodeSnapshotDocument(payload)
  if (!decoded.ok) return decoded
  const parsedRecord = asRecord(decoded.document)
  if (!parsedRecord || parsedRecord.v !== SCENE_SNAPSHOT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: 'unsupported_version',
        message: `snapshot schema version must be ${SCENE_SNAPSHOT_SCHEMA_VERSION}`,
      },
    }
  }

  return {
    ok: true,
    snapshot: normalizeSceneSnapshot(parsedRecord),
  }
}
