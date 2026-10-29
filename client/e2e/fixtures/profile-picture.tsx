import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext, accountsOff } from '../../src/app/auth-context'
import { api } from '../../src/lib/api-client'
import { PhotoPicker } from '../../src/features/account/PhotoPicker'
import '../../src/styles/tokens.css'
import '../../src/styles/app.css'
import '../../src/styles/polish.css'

const auth = { ...accountsOff, enabled: true, getToken: async () => 'synthetic-token' }

// Test-only entry, excluded from the production build. Uses the actual picker, image preparation and API client.
export function Fixture() {
  const [photo, setPhoto] = useState<string | null>(null)
  useEffect(() => { void api.me.photo('synthetic-token').then(result => setPhoto(result?.dataUrl ?? null)) }, [])
  return <AuthContext.Provider value={auth}><section style={{ padding: 24, maxWidth: 600 }}>
    <h1>Your picture</h1>
    <PhotoPicker name="Picture QA" photo={photo} onChange={setPhoto} />
  </section></AuthContext.Provider>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
