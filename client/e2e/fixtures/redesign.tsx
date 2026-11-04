import './app-styles'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext, accountsOff } from '../../src/app/auth-context'
import { ActivityPage } from '../../src/features/activities/ActivityPage'
import { PlanView } from '../../src/features/plan/PlanView'
import type { Activity, ActivitySummary, TrainingPlan } from '../../src/lib/types'
import plan from '../../src/test/fixtures/plan-5k.json'
import activity from '../../src/test/fixtures/activity-long-run.json'

const run = { ...activity, id: 'qa-run', localDate: '2026-10-13', ...(new URLSearchParams(location.search).has('stages') ? {
  workoutExecution: { stages: [{ number: 1, kind: 'Run', plannedMetres: 14000, plannedSeconds: null, recordedMetres: 14000, movingSeconds: 5600, elapsedSeconds: 5600, coverage: 1, paceSecondsPerKm: 400, fastestSecondsPerKm: 441, slowestSecondsPerKm: 490, inTargetShare: 0 }] },
} : {}) } as Activity
const records = [{ ...run, source: run.source } as ActivitySummary, ...(new URLSearchParams(location.search).has('progress') ? ['2026-09-28', '2026-10-05', '2026-10-12'].map((date, index) => ({
  id: `synthetic-easy-${index}`, localDate: date, startedAt: `${date}T06:00:00Z`, kind: 'Run', distanceKm: 5, movingSeconds: 5 * (360 - index * 5), paceSecondsPerKm: 360 - index * 5,
  plannedSessionType: 'Easy', plannedTitle: 'Easy run', pace: null, averageHeartRate: null, source: { kind: 'Upload' },
} as ActivitySummary)) : [])]
export function Fixture() {
  const [analysis, setAnalysis] = useState(false)
  return <AuthContext.Provider value={accountsOff}><div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
    {analysis ? <ActivityPage id={run.id} initial={run} units="km" onBack={() => setAnalysis(false)} onDeleted={() => setAnalysis(false)} /> : <PlanView plan={plan as TrainingPlan} today="2026-10-14" units="km" onUnitsChange={() => {}} shareUrl="https://example.test" runs={records} onOpenRun={() => setAnalysis(true)} />}
  </div></AuthContext.Provider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
