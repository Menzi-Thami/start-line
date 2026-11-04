import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext, accountsOff } from '../../src/app/auth-context'
import { ActivityPage } from '../../src/features/activities/ActivityPage'
import { PlanView } from '../../src/features/plan/PlanView'
import type { Activity, ActivitySummary, TrainingPlan } from '../../src/lib/types'
import plan from '../../src/test/fixtures/plan-5k.json'
import activity from '../../src/test/fixtures/activity-long-run.json'
import '@fontsource/instrument-serif'
import '@fontsource-variable/instrument-sans'
import '../../src/styles/tokens.css'
import '../../src/styles/app.css'
import '../../src/styles/polish.css'
import '../../src/styles/skin.css'

const run = { ...activity, id: 'qa-run', localDate: '2026-10-13' } as Activity
export function Fixture() {
  const [analysis, setAnalysis] = useState(false)
  return <AuthContext.Provider value={accountsOff}><div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
    {analysis ? <ActivityPage id={run.id} initial={run} units="km" onBack={() => setAnalysis(false)} onDeleted={() => setAnalysis(false)} /> : <PlanView plan={plan as TrainingPlan} today="2026-10-14" units="km" onUnitsChange={() => {}} shareUrl="https://example.test" runs={[{ ...run, source: run.source } as ActivitySummary]} onOpenRun={() => setAnalysis(true)} />}
  </div></AuthContext.Provider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
