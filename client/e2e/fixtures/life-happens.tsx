import { createRoot } from 'react-dom/client'
import type { LifeProposal, SessionRevision, TrainingPlan } from '../../src/lib/types'
import plan from '../../src/test/fixtures/plan-5k.json'
import { LifeHappens } from '../../src/features/plan/LifeHappens'
import '@fontsource/instrument-serif'
import '@fontsource-variable/instrument-sans'
import '../../src/styles/tokens.css'
import '../../src/styles/app.css'
import '../../src/styles/polish.css'
import '../../src/styles/skin.css'

// Served only by Playwright's local Vite server: the real component with a synthetic plan API.
const fixture = plan as TrainingPlan
const today = fixture.weeks[1]!.startDate
const day = (d: number) => new Date(Date.parse(`${today}T12:00:00Z`) + d * 86400000).toISOString().slice(0, 10)
const rest: SessionRevision = { appliedOn: today, date: day(6), originalType: 'LongRun', originalTitle: 'Long run', originalKm: 14, easyKm: null }
const moved: SessionRevision = { ...rest, date: day(5), easyKm: 14, movedFrom: day(6) }
const actions = {
  preview: async (change: { moveTo?: string | null }) =>
    ({ token: 'T'.repeat(64), changes: change.moveTo ? [rest, moved] : [], moveTargets: [day(4), day(5)], proposed: fixture }) as unknown as LifeProposal,
  apply: async () => {},
  restore: async () => {},
}
createRoot(document.getElementById('root')!).render(
  <LifeHappens plan={{ ...fixture, adjustments: [{ appliedOn: today, date: day(1), originalType: 'Intervals', originalTitle: 'Intervals', originalKm: 9, easyKm: 5 }] }} today={today} units="km" actions={actions} />,
)
