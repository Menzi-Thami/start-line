import './app-styles'
import { createRoot } from 'react-dom/client'
import { App } from '../../src/app/App'
import { AuthContext, accountsOff } from '../../src/app/auth-context'
createRoot(document.getElementById('root')!).render(<AuthContext.Provider value={accountsOff}><App /></AuthContext.Provider>)
