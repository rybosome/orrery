/** Own disposers for startup and release resources that arrive after cancellation. */
export function createSceneResources(signal: AbortSignal) {
  const disposers: Array<() => void> = []
  let disposed = false

  const dispose = () => {
    if (disposed) return
    disposed = true
    signal.removeEventListener('abort', dispose)
    for (const release of disposers.reverse()) release()
    disposers.length = 0
  }

  if (signal.aborted) dispose()
  else signal.addEventListener('abort', dispose, { once: true })

  return {
    add(release: () => void) {
      if (disposed) release()
      else disposers.push(release)
    },
    get disposed() {
      return disposed
    },
    dispose,
  }
}
