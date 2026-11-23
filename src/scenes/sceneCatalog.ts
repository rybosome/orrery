import { validateSceneDefinition, type SceneDefinition } from './sceneDefinition.js'
import { SOL_SCENE } from './sol.js'

/** Build the route index, validating every entry before the viewer can use it. */
export function createSceneCatalog(definitions: readonly SceneDefinition[]): ReadonlyMap<string, SceneDefinition> {
  const scenes = new Map<string, SceneDefinition>()
  for (const definition of definitions) {
    if (scenes.has(definition.id)) throw new Error(`Duplicate scene ID "${definition.id}"`)
    validateSceneDefinition(definition)
    scenes.set(definition.id, definition)
  }
  return scenes
}

const SCENE_CATALOG = createSceneCatalog([SOL_SCENE])

export const DEFAULT_SCENE: SceneDefinition = SOL_SCENE

/** Find an authored, available scene by its route ID. */
export function getSceneDefinition(sceneId: string): SceneDefinition | undefined {
  return SCENE_CATALOG.get(sceneId)
}
