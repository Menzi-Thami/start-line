import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import plan from '../../src/test/fixtures/plan-5k.json'
import type { LifeChange, LifeProposal, TrainingPlan } from '../../src/lib/types'
import { WeekGlance } from '../../src/features/plan/WeekGlance'
import { MoveRunDialog } from '../../src/features/plan/MoveRunDialog'
import '@fontsource/instrument-serif'
import '@fontsource-variable/instrument-sans'
import '../../src/styles/tokens.css'
import '../../src/styles/app.css'
import '../../src/styles/polish.css'
import '../../src/styles/skin.css'

const original = plan as TrainingPlan
const isRun = (type: string) => type !== 'Strength' && type !== 'Race'
const week = original.weeks.find(w => new Set(w.sessions.filter(s => isRun(s.type)).map(s => s.date)).size >= 2)!
const runDays = [...new Set(week.sessions.filter(s => isRun(s.type)).map(s => s.date))]
const from = runDays[0]!
const partner = runDays[1]!
const free = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(week.startDate + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10))
  .find(day => !week.sessions.some(s => s.date === day))!
const actions = {
  preview: async (change: LifeChange) => {
    const swap = change.situation === 'SwapRuns'
    const revision = (date: string, movedFrom?: string) =>
      ({ appliedOn: from, date, movedFrom, originalType: 'Easy', originalTitle: 'Easy run', originalKm: 4.5, easyKm: movedFrom ? 4.5 : null })
    const changes = !change.moveTo ? [] : swap
      ? [revision(from), revision(change.moveTo), revision(change.moveTo, from), revision(from, change.moveTo)]
      : [revision(change.moveTo, from)]
    return { token: 'T'.repeat(64), changes, moveTargets: swap ? [partner] : [free], proposed: original } as LifeProposal
  },
  apply: async (_change: LifeChange, _token: string) => {},
  restore: async (_dates: string[]) => {},
}
export function QA() {
  const [moving, setMoving] = useState<{ from: string; to?: string } | null>(null)
  const [applied, setApplied] = useState(false)
  return (
    <>
      <h1>Run move interaction QA</h1>
      <WeekGlance week={week} done={new Set()} today={week.startDate} units="km" onSelectDate={() => {}} onRequestMove={(from, to) => setMoving({ from, to })} />
      <button type="button" onClick={() => setMoving({ from })}>Move run</button>
      <button type="button" onClick={() => setMoving({ from, to: partner })}>Drop on another run</button>
      <p id="saved-state" role="status">{applied ? 'Saved' : 'Not saved'}</p>
      {moving && <MoveRunDialog from={moving.from} to={moving.to} units="km" plan={original}
        actions={{ ...actions, apply: async (change, token) => { await actions.apply(change, token); setApplied(true) } }}
        onClose={() => setMoving(null)} />}
    </>
  )
}
createRoot(document.getElementById('root')!).render(<QA />)
