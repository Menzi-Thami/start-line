import { createRoot } from 'react-dom/client'
import { CouchTo5K } from '../../src/features/beginner/CouchTo5K'
import '@fontsource/instrument-serif'
import '@fontsource-variable/instrument-sans'
import '../../src/styles/tokens.css'
import '../../src/styles/app.css'
import '../../src/styles/overview.css'
import '../../src/styles/home.css'
import '../../src/styles/polish.css'
import '../../src/styles/skin.css'

// Local browser QA fixture, not an actual runner account or production entry point.
createRoot(document.getElementById('root')!).render(
  <div className="page" style={{ marginInline: 'auto' }}>
    <CouchTo5K />
  </div>,
)
