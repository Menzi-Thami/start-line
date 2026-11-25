import './app-styles'
import { createRoot } from 'react-dom/client'
import { App } from '../../src/app/App'
import { accountsOff, AuthContext } from '../../src/app/auth-context'

// The real application with a disposable identity. Waiting is controlled only in this excluded QA entry.
const auth = { ...accountsOff, enabled: true, account: { id: 'release-qa-runner', name: 'Release QA', email: null },
  getToken: async () => {
    if (document.documentElement.dataset.qaHoldToken === 'true') {
      await new Promise<void>(resolve => window.addEventListener('qa:release-token', () => resolve(), { once: true }))
    }
    return 'synthetic-release-token'
  } }
createRoot(document.getElementById('root')!).render(<AuthContext.Provider value={auth}><App /></AuthContext.Provider>)
