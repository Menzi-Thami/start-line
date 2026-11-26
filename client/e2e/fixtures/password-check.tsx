import './app-styles'
import { createRoot } from 'react-dom/client'
import { accountsOff, AuthContext } from '../../src/app/auth-context'
import { PasswordCheck } from '../../src/features/account/PasswordCheck'

const signedIn = new URLSearchParams(location.search).get('session') !== 'signed-out'
const action = (name: string) => { document.documentElement.dataset.qaAction = name }
const auth = { ...accountsOff, enabled: true, sessionReady: signedIn,
  account: signedIn ? { id: 'password-qa-owner', name: 'Password QA', email: null } : null,
  getToken: async () => 'synthetic-password-check-token', signIn: () => action('sign-in'), signUp: () => action('sign-up'),
  signOut: () => action('sign-out'), signInWithGoogle: () => action('google') }
createRoot(document.getElementById('root')!).render(<AuthContext.Provider value={auth}><PasswordCheck /></AuthContext.Provider>)
