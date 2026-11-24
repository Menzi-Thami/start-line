/**
 * Whether this environment offers password-backed registration to new customers.
 * The tenant setting is per app, so each deployment says which it uses (VITE_AUTH_PASSWORDS, docs/accounts-setup.md)
 * and existing customers may keep their original OTP sign-in method.
 */
export function signsInWithPassword(env: Record<string, string | undefined> = import.meta.env): boolean {
  return env.VITE_AUTH_PASSWORDS?.trim().toLowerCase() === 'true'
}
