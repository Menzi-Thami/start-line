import './app-styles'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext, accountsOff } from '../../src/app/auth-context'
import { SessionGate } from '../../src/app/AppAuth'

// Real production gate, synthetic session transitions only. Excluded from the production bundle.
export function GateFixture() {
  const [state, setState] = useState(new URLSearchParams(location.search).get('session') ?? 'signed-out')
  useEffect(() => {
    const change = (event: Event) => setState((event as CustomEvent<string>).detail)
    window.addEventListener('qa:session', change)
    return () => window.removeEventListener('qa:session', change)
  }, [])
  const auth = { ...accountsOff, enabled: true, loading: state === 'loading', sessionReady: state === 'verified',
    account: state === 'signed-out' ? null : { id: 'synthetic-auth-runner', name: 'QA runner', email: null } }
  return <AuthContext.Provider value={auth}><SessionGate><main id="main-content"><h1>Private training fixture</h1></main></SessionGate></AuthContext.Provider>
}
createRoot(document.getElementById('root')!).render(<GateFixture />)
