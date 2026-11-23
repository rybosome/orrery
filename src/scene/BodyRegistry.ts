import type { BodyRef } from '../spice/types.js'
import { SOL_BODIES, type BodyId, type BodyRegistryEntry } from '../scenes/solBodies.js'

export type { BodyId, BodyKind, BodyRegistryEntry, NaifIds } from '../scenes/solBodies.js'

// ---------------------------------------------------------------------------
// Registry indexes
// ---------------------------------------------------------------------------

/** Fast lookup by stable `BodyId`. */
const BODY_REGISTRY_BY_ID = new Map<BodyId, BodyRegistryEntry>()

/**
 * Fast lookup by the SPICE target passed to `SpiceClient.getBodyState`.
 *
 * NOTE: this key is stringified because `BodyRef` can be a number or a string,
 * and consumers often carry it around as a string in `userData`.
 */
const BODY_REGISTRY_BY_BODY_REF_KEY = new Map<string, BodyRegistryEntry>()

/**
 * Best-effort lookup key map for strings coming from URL params / `mesh.userData`.
 *
 * Covers:
 * - `BodyRegistryEntry.id` (case-insensitive)
 * - `BodyRegistryEntry.body` (stringified)
 * - `BodyRegistryEntry.naifIds.body` / `.barycenter` (stringified)
 */
const BODY_REGISTRY_BY_RESOLVE_KEY = new Map<string, BodyRegistryEntry>()

// Only treat *base-10 integer* strings as numeric keys.
//
// NOTE: This intentionally does NOT accept decimals / exponent notation.
const INTEGER_RESOLVE_KEY_RE = /^[+-]?\d+$/

/**
 * Convert an arbitrary resolve-key string into the canonical key used by
 * `resolveBodyRegistryEntry`.
 *
 * Contract:
 * - Returns `''` for empty / whitespace-only inputs.
 * - For base-10 integer strings (`/^[+-]?\d+$/`):
 *   - If the value is a safe integer, return `String(Number(s))`.
 *     - This normalizes leading zeros (`'00399' -> '399'`), leading `+`
 *       (`'+00399' -> '399'`), and `-0` (`'-0' -> '0'`).
 *   - Otherwise treat the input as an opaque, case-insensitive string key.
 *     - Strip a leading `+` when returning the string key.
 * - For all other strings, return `trimmed.toUpperCase()`.
 */
const canonicalizeResolveKey = (raw: string) => {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  // Treat base-10 integer strings as numeric ids (safe-int only).
  if (INTEGER_RESOLVE_KEY_RE.test(trimmed)) {
    const n = Number(trimmed)
    if (Number.isSafeInteger(n)) {
      return String(n)
    }

    // If it's an integer string but not a safe integer, treat it as a
    // non-numeric key to avoid accidental collisions.
    const withoutPlus = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed
    return withoutPlus.toUpperCase()
  }

  // Body ids / names are treated as case-insensitive.
  return trimmed.toUpperCase()
}

const addResolveKey = (rawKey: string, entry: BodyRegistryEntry) => {
  const key = canonicalizeResolveKey(rawKey)
  if (!key) return

  // Defensive: preserve the first entry if a later registry item accidentally
  // duplicates a resolve key.
  if (!BODY_REGISTRY_BY_RESOLVE_KEY.has(key)) {
    BODY_REGISTRY_BY_RESOLVE_KEY.set(key, entry)
  }
}

for (const entry of SOL_BODIES) {
  BODY_REGISTRY_BY_ID.set(entry.id, entry)

  const key = String(entry.body)
  // Defensive: preserve the first entry if a later registry item accidentally
  // duplicates a `body` ref.
  if (!BODY_REGISTRY_BY_BODY_REF_KEY.has(key)) {
    BODY_REGISTRY_BY_BODY_REF_KEY.set(key, entry)
  }

  // Unified resolver keys.
  addResolveKey(entry.id, entry)
  addResolveKey(key, entry)
  if (entry.naifIds) {
    addResolveKey(String(entry.naifIds.body), entry)
    if (entry.naifIds.barycenter != null) addResolveKey(String(entry.naifIds.barycenter), entry)
  }
}

/** Look up a registry entry by stable viewer body ID (throws if missing). */
export function getBodyRegistryEntry(id: BodyId): BodyRegistryEntry {
  const found = BODY_REGISTRY_BY_ID.get(id)
  if (!found) {
    throw new Error(`BodyRegistry: missing registry entry for ${JSON.stringify(id)}`)
  }
  return found
}

/** Look up a registry entry by its SPICE body ref (e.g. NAIF ID string/number). */
export function getBodyRegistryEntryByBodyRef(body: BodyRef): BodyRegistryEntry | undefined {
  return BODY_REGISTRY_BY_BODY_REF_KEY.get(String(body))
}

/**
 * Best-effort resolver for strings coming from URL params / `mesh.userData`.
 *
 * `raw` may be a `BodyId` (e.g. 'EARTH') or a SPICE `BodyRef` (e.g. '3').
 */
export function resolveBodyRegistryEntry(raw: string): BodyRegistryEntry | undefined {
  const key = canonicalizeResolveKey(raw)
  if (!key) return undefined
  return BODY_REGISTRY_BY_RESOLVE_KEY.get(key)
}

export const __testing = {
  canonicalizeResolveKey,
}
