import './app-styles'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../../src/app/App'
import { AuthContext, accountsOff, type Auth } from '../../src/app/auth-context'

export function PersistedApp() {
  const [subject, setSubject] = useState('synthetic-private-browser-owner')
  const auth: Auth = { ...accountsOff, enabled: true, sessionReady: !!subject,
    account: subject ? { id: subject, name: 'Synthetic private runner', email: null } : null,
    getToken: async () => subject || null, signOut: () => setSubject(''),
  }
  return <AuthContext.Provider value={auth}><App /></AuthContext.Provider>
}
createRoot(document.getElementById('root')!).render(<PersistedApp />)
