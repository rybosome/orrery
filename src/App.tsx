import './App.css'
import { SceneCanvas } from './SceneCanvas'
import { buildScenePath, canonicalHomePath, resolveSceneRoute } from './scenes/sceneRoute.js'
import { createSolTestScene } from './e2eHooks/solTestScene.js'

const { pathname, search, hash } = window.location
const query = new URLSearchParams(search)
const route = resolveSceneRoute(pathname, import.meta.env.BASE_URL)
const canonicalPath = canonicalHomePath(pathname, import.meta.env.BASE_URL)
if (canonicalPath) window.history.replaceState(window.history.state, '', canonicalPath + search + hash)
const useTestScene = import.meta.env.DEV && query.has('e2e') && query.has('testScene')

function App() {
  const scene = route.kind === 'scene' ? (useTestScene ? createSolTestScene() : route.scene) : null
  return (
    <div className="app">
      {/* Visually-hidden heading for e2e smoke + accessibility. */}
      <h1 className="sr-only">Orrery</h1>
      <main className="main">
        {scene && route.kind === 'scene' ? (
          <SceneCanvas
            key={scene.id}
            definition={scene}
            snapshot={route.snapshot}
            invalidSnapshot={route.invalidSnapshot}
          />
        ) : (
          <section className="sceneRouteError">
            <h2>Unknown scene</h2>
            <a href={buildScenePath('sol', import.meta.env.BASE_URL)}>Open the Solar System</a>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
