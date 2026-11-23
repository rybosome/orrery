import './App.css'
import { SceneCanvas } from './SceneCanvas'
import { DEFAULT_SCENE } from './scenes/sceneCatalog.js'
import { createSolTestScene } from './e2eHooks/solTestScene.js'

const query = new URLSearchParams(window.location.search)
const scene = import.meta.env.DEV && query.has('e2e') && query.has('testScene') ? createSolTestScene() : DEFAULT_SCENE

function App() {
  return (
    <div className="app">
      {/* Visually-hidden heading for e2e smoke + accessibility. */}
      <h1 className="sr-only">Orrery</h1>
      <main className="main">
        <SceneCanvas key={scene.id} definition={scene} />
      </main>
    </div>
  )
}

export default App
