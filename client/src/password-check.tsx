import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/instrument-serif'
import '@fontsource-variable/instrument-sans'
import './styles/tokens.css'
import './styles/app.css'
import './styles/polish.css'
import './styles/skin.css'
import './styles/sign-in-landing.css'
import { AuthProvider } from './app/AuthProvider'
import { PasswordCheck } from './features/account/PasswordCheck'
import { passwordCheckConfig } from './features/account/password-check-config'
import { applyStoredTheme } from './lib/theme'
import { ScreenRecovery } from './app/ScreenRecovery'

applyStoredTheme()
const root = document.getElementById('root')
if (!root) throw new Error('Missing password-check root')
createRoot(root).render(<StrictMode><ScreenRecovery><AuthProvider config={passwordCheckConfig()}><PasswordCheck /></AuthProvider></ScreenRecovery></StrictMode>)
