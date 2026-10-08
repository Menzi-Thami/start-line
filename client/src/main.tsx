import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/700.css'
import './styles/tokens.css'
import './styles/app.css'
import { App } from './app/App'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
