import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/instrument-serif'
import '@fontsource-variable/instrument-sans'
import './styles/tokens.css'
import './styles/app.css'
import './styles/overview.css'
import './styles/home.css'
import './styles/polish.css'
import './styles/skin.css'
import { App } from './app/App'
import { readAuthConfig } from './app/auth-context'
import { AppAuth } from './app/AppAuth'
import { wakeApi } from './lib/api-client'
import { setUpInstall } from './lib/install-app'
import { applyStoredTheme } from './lib/theme'

// The runner's light or dark choice on the website, before the first paint.
applyStoredTheme()
// The free API sleeps when idle; start it waking now, while the page and any sign-in redirect are still loading.
wakeApi()
// Taperday can be added to a home screen: catch the browser's offer before React starts, and register the service worker.
setUpInstall()
// A printed plan shows every session in full, folded or not.
window.addEventListener('beforeprint', () => document.querySelectorAll('details.session-more').forEach((d) => ((d as HTMLDetailsElement).open = true)))

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <AppAuth config={readAuthConfig()}><App /></AppAuth>
  </StrictMode>,
)
