import './App.css'
import { SceneCanvas } from './SceneCanvas'
import { buildScenePath, resolveSceneRoute } from './scenes/sceneRoute.js'
import { createSolTestScene } from './e2eHooks/solTestScene.js'

const query = new URLSearchParams(window.location.search)
const route = resolveSceneRoute(window.location.pathname, import.meta.env.BASE_URL)
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
