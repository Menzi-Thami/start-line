import './app-styles'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../../src/app/App'
import { AuthContext, accountsOff, type Auth } from '../../src/app/auth-context'

export function PersistedApp() {
  const [subject, setSubject] = useState('synthetic-private-browser-owner')
  useEffect(() => {
    const switchAccount = (event: Event) => {
      const wanted = (event as CustomEvent<string>).detail
      if (wanted === 'synthetic-private-browser-owner' || wanted === 'synthetic-private-browser-other') setSubject(wanted)
    }
    window.addEventListener('synthetic-switch-account', switchAccount)
    return () => window.removeEventListener('synthetic-switch-account', switchAccount)
  }, [])
  const auth: Auth = { ...accountsOff, enabled: true, sessionReady: !!subject,
    account: subject ? { id: subject, name: 'Synthetic private runner', email: null } : null,
    getToken: async () => subject || null, signOut: () => setSubject(''),
  }
  return <AuthContext.Provider value={auth}><App /></AuthContext.Provider>
}
createRoot(document.getElementById('root')!).render(<PersistedApp />)
