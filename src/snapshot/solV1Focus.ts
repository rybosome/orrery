import { resolveBodyRegistryEntry } from '../scene/BodyRegistry.js'
import type { BodyRef } from '../spice/types.js'

/** Map a v1 Sol body name, physical ID, or barycenter to a viewer body ID. */
export function resolveSolV1Focus(body: BodyRef): string | undefined {
  return resolveBodyRegistryEntry(String(body))?.id
}
