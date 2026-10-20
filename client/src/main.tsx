import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/700.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './styles/tokens.css'
import './styles/app.css'
import './styles/overview.css'
import { App } from './app/App'
import { readAuthConfig } from './app/auth-context'
import { AuthProvider } from './app/AuthProvider'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <AuthProvider config={readAuthConfig()}>
      <App />
    </AuthProvider>
  </StrictMode>,
)
