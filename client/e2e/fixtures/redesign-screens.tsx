import './app-styles'
import { createRoot } from 'react-dom/client'
import { AuthContext, accountsOff } from '../../src/app/auth-context'
import { AccountPage } from '../../src/features/account/AccountPage'
import { Home } from '../../src/features/runner-home/Home'
import { BuilderForm } from '../../src/features/builder/BuilderForm'
import { MyRuns } from '../../src/features/activities/MyRuns'
import { fromSearchParams } from '../../src/lib/plan-url'
import type { Runner, TrainingPlan, ActivitySummary, Race } from '../../src/lib/types'
import plan from '../../src/test/fixtures/plan-5k.json'
import races from '../../src/test/fixtures/races.json'
import run from '../../src/test/fixtures/activity-long-run.json'
import { current } from '../../src/test/run-history-data'
const noop = () => {}
const auth = { ...accountsOff, enabled: true, account: { name: 'QA runner', email: 'qa@example.test' }, getToken: () => Promise.resolve('synthetic-token') }
const runner: Runner = { id: 'qa-runner', displayName: 'QA runner', email: 'qa@example.test', timeZone: 'Africa/Johannesburg', units: 'Kilometres', weeklyEmails: false, consentedAt: '2026-10-08T09:00:00Z', maxHeartRate: null, privacyNoticeVersion: '2026-10-21', needsPrivacyConsent: false, heartRateConsent: false, updateEmails: false, updateEmailsOffAt: null }
const initial = fromSearchParams(new URLSearchParams('km=5&date=2026-12-13&name=Parkrun+PB&goal=1470&days=tu.th.sa.su&long=su&exp=regular&from=2026-10-08'))
const screen = new URLSearchParams(location.search).get('screen')
export function Fixture() {
  return <AuthContext.Provider value={auth}><div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
    {screen === 'account' ? <AccountPage runner={runner} onSaved={noop} onDeleted={noop} onOpenRuns={noop} />
      : screen === 'builder' ? <BuilderForm races={{ kind: 'ready', races: races as Race[] }} onRetryRaces={noop} initial={initial} units="km" busy={false} serverErrors={{}} today="2026-10-08" onSubmit={noop} />
        : screen === 'runs' ? <MyRuns units="km" onOpen={noop} />
          : <Home runner={runner} today="2026-10-13" units="km" current={current} initialPlan={{ id: current.id, plan: plan as TrainingPlan }} runs={[run as ActivitySummary]} onOpenPlan={noop} onOpenDay={noop} onBuildPlan={noop} onOpenRun={noop} onOpenRuns={noop} onOpenAccount={noop} />}
  </div></AuthContext.Provider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
