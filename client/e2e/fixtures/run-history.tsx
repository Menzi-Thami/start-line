import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ActivitySummary } from '../../src/lib/types'
import { Journey } from '../../src/test/run-history-journey'
import '../../src/styles/tokens.css'
import '../../src/styles/app.css'
import '../../src/styles/overview.css'
import '../../src/styles/home.css'
import '../../src/styles/polish.css'

// Served only by Playwright's local Vite server; never included in the production build.
export function Fixture() {
  const date = new URLSearchParams(location.search).get('date') ?? '2026-10-14'
  const km = Number(new URLSearchParams(location.search).get('km') ?? 12)
  const [runs, setRuns] = useState<ActivitySummary[]>([{
    id: 'synthetic-strava', localDate: date, startedAt: `${date}T06:00:00Z`, kind: 'Run', distanceKm: km,
    movingSeconds: 4000, source: { kind: 'Strava' },
  } as ActivitySummary])
  return <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
    <button onClick={() => setRuns([])}>Expire imported details</button>
    <button onClick={() => setRuns(current => current.map(run => ({ ...run, distanceKm: run.distanceKm + 1 })))}>Update synced distance</button>
    <Journey runs={runs} />
  </div>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
