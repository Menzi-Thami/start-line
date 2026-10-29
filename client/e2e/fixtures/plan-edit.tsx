import { createRoot } from 'react-dom/client'
import { App } from '../../src/app/App'
import { AuthContext, accountsOff } from '../../src/app/auth-context'
import '../../src/styles/tokens.css'
import '../../src/styles/app.css'
import '../../src/styles/overview.css'
import '../../src/styles/home.css'
import '../../src/styles/polish.css'

// Actual application and builder, with synthetic authentication only. Never included in the production build.
const auth = { ...accountsOff, enabled: true, account: { name: 'History QA', email: 'history@example.test' }, getToken: () => Promise.resolve('synthetic-token') }
createRoot(document.getElementById('root')!).render(<AuthContext.Provider value={auth}><App /></AuthContext.Provider>)
