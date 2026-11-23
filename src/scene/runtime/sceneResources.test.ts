import { describe, expect, it, vi } from 'vitest'

import { createSceneResources } from './sceneResources.js'

describe('scene startup resource ownership', () => {
  it('releases the abandoned mount and any late worker without affecting the next mount', () => {
    const firstMount = new AbortController()
    const first = createSceneResources(firstMount.signal)
    const removeScene = vi.fn()
    first.add(removeScene)

    firstMount.abort()
    const nextMount = new AbortController()
    const next = createSceneResources(nextMount.signal)
    const releaseNextWorker = vi.fn()
    next.add(releaseNextWorker)

    const releaseLateWorker = vi.fn()
    first.add(releaseLateWorker)
    first.dispose()
    expect(removeScene).toHaveBeenCalledTimes(1)
    expect(releaseLateWorker).toHaveBeenCalledTimes(1)
    expect(releaseNextWorker).not.toHaveBeenCalled()

    nextMount.abort()
    expect(releaseNextWorker).toHaveBeenCalledTimes(1)
  })
})
