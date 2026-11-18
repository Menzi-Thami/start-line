import { createRoot } from 'react-dom/client'
import type { LifeProposal, SessionRevision, TrainingPlan } from '../../src/lib/types'
import plan from '../../src/test/fixtures/plan-5k.json'
import { ChangePlan } from '../../src/features/plan/ChangePlan'
import '@fontsource/instrument-serif'
import '@fontsource-variable/instrument-sans'
import '../../src/styles/tokens.css'
import '../../src/styles/app.css'
import '../../src/styles/polish.css'
import '../../src/styles/skin.css'

// Served only by Playwright's local Vite server: the real component with a synthetic plan API. Thursday of week 2.
const fixture = plan as TrainingPlan
const today = '2026-10-22'
const day = (d: number) => new Date(Date.parse(`${today}T12:00:00Z`) + d * 86400000).toISOString().slice(0, 10)
const missed: SessionRevision = { appliedOn: today, date: '2026-10-20', originalType: 'Fartlek', originalTitle: 'Fartlek', originalKm: 6.5, easyKm: null }
const moved: SessionRevision = { ...missed, date: day(2), easyKm: 6.5, movedFrom: '2026-10-20' }
const actions = {
  preview: async (change: { moveTo?: string | null }) =>
    ({ token: 'T'.repeat(64), changes: change.moveTo ? [missed, moved] : [], moveTargets: [day(1), day(2)], proposed: fixture }) as unknown as LifeProposal,
  apply: async () => {},
  restore: async () => {},
}
createRoot(document.getElementById('root')!).render(
  <main className="page"><ChangePlan plan={{ ...fixture, adjustments: [{ appliedOn: today, date: day(2), originalType: 'Intervals', originalTitle: 'Intervals', originalKm: 9, easyKm: 5 }] }} today={today} units="km" life={actions} onReplan={async () => {}} /></main>,
)
