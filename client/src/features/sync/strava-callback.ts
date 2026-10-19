/** Where Strava sends the runner back to. Must sit on the Strava app's authorization callback domain. */
export const STRAVA_CALLBACK_PATH = '/strava/callback'

export interface StravaCallback {
  code: string | null
  state: string | null
  scope: string | null
  error: string | null
}

/** Strava's answer on the callback page, or null on any other page. */
export function readStravaCallback(location: Pick<Location, 'pathname' | 'search'>): StravaCallback | null {
  if (location.pathname !== STRAVA_CALLBACK_PATH) return null
  const params = new URLSearchParams(location.search)
  return { code: params.get('code'), state: params.get('state'), scope: params.get('scope'), error: params.get('error') }
}
