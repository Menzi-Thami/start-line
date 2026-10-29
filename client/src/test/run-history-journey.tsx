import { useState } from 'react'
import { AuthContext, accountsOff } from '../app/auth-context'
import type { ActivitySummary, Runner, TrainingPlan } from '../lib/types'
import plan from './fixtures/plan-5k.json'
import { PlanView } from '../features/plan/PlanView'
import { Home } from '../features/runner-home/Home'
import { useCheckIns } from '../features/coaching/useCheckIns'
import { CheckInLoadState } from '../features/coaching/CheckInLoadState'
import { current, today } from './run-history-data'

const planFixture = plan as TrainingPlan
const auth = { ...accountsOff, enabled: true, getToken: () => Promise.resolve('synthetic-token') }
const noop = () => {}

function SavedPlan({ runs }: { runs: ActivitySummary[] }) {
  const checkIns = useCheckIns(current.id)
  return <><CheckInLoadState ready={checkIns.ready} failed={checkIns.failed} retry={checkIns.retry} /><PlanView plan={planFixture} today={today} units="km" onUnitsChange={noop} shareUrl="https://example.test/plan" runs={runs}
    canCompleteRuns={checkIns.ready}
    coach={checkIns.ready ? { ...checkIns, today, units: 'km' } : undefined} /></>
}

// Remount both actual screens so navigation must reload the persisted API entries.
export function Journey({ runs }: { runs: ActivitySummary[] }) {
  const [view, setView] = useState('home')
  return <AuthContext.Provider value={auth}>
    <button onClick={() => setView('home')}>Return home</button>
    <button onClick={() => setView('plan')}>Visit calendar</button>
    {view === 'home' ? <Home runner={{ id: 'synthetic-runner', displayName: 'QA runner' } as Runner} today={today} units="km" current={current}
      initialPlan={{ id: current.id, plan: planFixture }} runs={runs} onOpenPlan={() => setView('plan')}
      onOpenAccount={noop} onOpenRun={noop} onOpenRuns={noop} onBuildPlan={noop} /> : <SavedPlan runs={runs} />}
  </AuthContext.Provider>
}

