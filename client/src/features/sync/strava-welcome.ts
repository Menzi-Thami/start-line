const prefix = 'taperday:strava-welcome:'

/** Only a just-created profile opts into this short, skippable step.
 * Session storage survives the Strava redirect but doesn't nag returning users on another device. */
export function beginStravaWelcome(runnerId: string, returnSearch: string) {
  try {
    window.sessionStorage.setItem(prefix + runnerId, returnSearch || '?')
  } catch {
    // Private browsing may block session storage; the step still works for this visit.
  }
}

export function hasStravaWelcome(runnerId: string): boolean {
  try {
    return window.sessionStorage.getItem(prefix + runnerId) !== null
  } catch {
    return false
  }
}

export function finishStravaWelcome(runnerId: string): string {
  try {
    const search = window.sessionStorage.getItem(prefix + runnerId) ?? ''
    window.sessionStorage.removeItem(prefix + runnerId)
    return search
  } catch {
    return ''
  }
}
