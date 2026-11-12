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
const week = original.weeks.find(w => w.sessions.some(s => s.type !== 'Strength' && s.type !== 'Race'))!
const from = week.sessions.find(s => s.type !== 'Strength' && s.type !== 'Race')!.date
const to = week.startDate === from
  ? new Date(Date.parse(from + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)
  : week.startDate
const actions = {
  preview: async (change: LifeChange) => ({
    token: 'T'.repeat(64),
    changes: change.moveTo ? [{ appliedOn: from, date: change.moveTo, movedFrom: from, originalType: 'Easy', originalTitle: 'Easy run', originalKm: 4.5, easyKm: 4.5 }] : [],
    moveTargets: [to],
    proposed: original,
  }) as LifeProposal,
  apply: async (_change: LifeChange, _token: string) => {},
  restore: async (_dates: string[]) => {},
}
function QA() {
  const [moving, setMoving] = useState<{ from: string; to?: string } | null>(null)
  const [applied, setApplied] = useState(false)
  return (
    <>
      <h1>Run move interaction QA</h1>
      <WeekGlance week={week} done={new Set()} today={week.startDate} units="km" onSelectDate={() => {}} onRequestMove={(from, to) => setMoving({ from, to })} />
      <button type="button" onClick={() => setMoving({ from })}>Move run</button>
      <p id="saved-state" role="status">{applied ? 'Saved' : 'Not saved'}</p>
      {moving && <MoveRunDialog from={moving.from} to={moving.to} units="km" plan={original}
        actions={{ ...actions, apply: async (change, token) => { await actions.apply(change, token); setApplied(true) } }}
        onClose={() => setMoving(null)} />}
    </>
  )
}
createRoot(document.getElementById('root')!).render(<QA />)
