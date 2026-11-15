import './app-styles'
import { createRoot } from 'react-dom/client'
import { App } from '../../src/app/App'
import { AuthContext, accountsOff } from '../../src/app/auth-context'

// Real application and hooks; only authentication and the API responses in the browser tests are synthetic.
const auth = { ...accountsOff, enabled: true, account: { id: 'synthetic-journey-runner', name: 'Journey QA', email: 'journey@example.test' }, getToken: async () => 'synthetic-token' }
createRoot(document.getElementById('root')!).render(<AuthContext.Provider value={auth}><App /></AuthContext.Provider>)
