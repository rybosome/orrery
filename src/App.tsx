import './App.css'
import { SceneCanvas } from './SceneCanvas'
import { DEFAULT_SCENE } from './scenes/sceneCatalog.js'

function App() {
  return (
    <div className="app">
      {/* Visually-hidden heading for e2e smoke + accessibility. */}
      <h1 className="sr-only">Orrery</h1>
      <main className="main">
        <SceneCanvas key={DEFAULT_SCENE.id} definition={DEFAULT_SCENE} />
      </main>
    </div>
  )
}

export default App
