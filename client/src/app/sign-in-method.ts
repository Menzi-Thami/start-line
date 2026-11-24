/**
 * Whether this environment's user flow signs runners in with email and password rather than an emailed code.
 * The tenant setting is per app, so each deployment says which it uses (VITE_AUTH_PASSWORDS, docs/accounts-setup.md)
 * and the wording on Taperday's own pages matches what Microsoft's page will ask for.
 */
export function signsInWithPassword(env: Record<string, string | undefined> = import.meta.env): boolean {
  return env.VITE_AUTH_PASSWORDS?.trim().toLowerCase() === 'true'
}
