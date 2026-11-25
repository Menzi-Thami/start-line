import { readAuthConfig, type AuthConfig } from '../../app/auth-context'

/** Only a separately configured Microsoft SPA may run this check. Query parameters cannot select a client or issuer. */
export function passwordCheckConfig(env: Record<string, string | undefined> = import.meta.env): AuthConfig | null {
  const clientId = env.VITE_AUTH_PASSWORD_CHECK_CLIENT_ID?.trim()
  if (!clientId || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(clientId)
    || clientId.toLowerCase() === env.VITE_AUTH_CLIENT_ID?.trim().toLowerCase()) return null
  const normal = readAuthConfig(env)
  return normal ? { ...normal, clientId, redirectPath: '/password-check.html' } : null
}
