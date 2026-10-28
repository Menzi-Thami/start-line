const testing = import.meta.env.MODE === 'test'

/** How long before the wait is explained: a warm server answers well inside this. */
export const SLOW_AFTER_MS = testing ? 300 : 6000

/** Between checks of whether the server is up yet. */
export const WAKE_CHECK_MS = testing ? 20 : 3000

/** How far a slow request has got: API reachable, database ready, then account still loading. */
export type WakeStep = 'server' | 'database' | 'almost'

/**
 * Follows the wake through the API's health checks: `live` answers once the server is up (it never touches the
 * database), then `ready` once the database is healthy. Only ever a hint
 * for the screen: a failed check is "not yet", and the page shows the moment the account loads, whatever this says.
 */
export async function followWake(
  up: (check: 'live' | 'ready') => Promise<boolean>,
  pause: () => Promise<unknown>,
  onStep: (step: WakeStep) => void,
  stopped: () => boolean,
): Promise<void> {
  while (!stopped() && !(await up('live'))) await pause()
  if (stopped()) return
  onStep('database')
  while (!stopped() && !(await up('ready'))) await pause()
  if (!stopped()) onStep('almost')
}
