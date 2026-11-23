import type { BodyRef } from '../spice/types.js'

// These are the released Sol aliases. Keep them stable when editing scene targets.
const legacyAliases = new Map<string, string>(
  [
    ['SUN', '10'],
    ['MERCURY', '1', '199'],
    ['VENUS', '2', '299'],
    ['EARTH', '3', '399'],
    ['MARS', '4', '499'],
    ['JUPITER', '5', '599'],
    ['SATURN', '6', '699'],
    ['URANUS', '7', '799'],
    ['NEPTUNE', '8', '899'],
    ['MOON', '301'],
  ].flatMap(([id, ...aliases]) => [id, ...aliases].map((alias) => [alias, id] as const)),
)

/** Map a released v1 focus reference to the corresponding Sol body ID. */
export function resolveSolV1Focus(body: BodyRef): string | undefined {
  const key = String(body).trim().toUpperCase()
  if (/^[+-]?\d+$/.test(key)) {
    const id = Number(key)
    if (Number.isSafeInteger(id)) return legacyAliases.get(String(id))
  }
  return legacyAliases.get(key)
}
