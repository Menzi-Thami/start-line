import { createRoot } from 'react-dom/client'
import type { AiCoachStatus, CoachAnswer, SessionAdjustment, SessionAdjustmentRequest, TrainingPlan } from '../../src/lib/types'
import plan from '../../src/test/fixtures/plan-5k.json'
import { AiCoachPanel, type AiCoachActions } from '../../src/features/plan/AiCoachPanel'
import './app-styles'

// Served only by Playwright's local Vite server: the real coach with a synthetic API. Thursday of week 2.
const fixture = plan as TrainingPlan
const today = '2026-10-22'
const units = new URLSearchParams(window.location.search).get('units') === 'mi' ? 'mi' : 'km'
const calls: { name: string; args: unknown[] }[] = []
Object.assign(window, { coachCalls: calls })

const longRun = { date: '2026-10-25', type: 'LongRun', title: 'Long run', distanceKm: 6.5, zone: 'LongRun', fastestSecondsPerKm: 390, slowestSecondsPerKm: 420, estimatedMinutes: 44, steps: [] } as const
const proposal = (request: SessionAdjustmentRequest): SessionAdjustment => {
  const km = request.km ?? (request.minutes ? Math.round((request.minutes / 6.75) * 10) / 10 : 6.5)
  return {
    token: 'T'.repeat(64),
    outcome: 'Proposed',
    reason: 'A shorter long run still keeps the shape of your week.',
    before: { ...longRun, date: request.date },
    after: { ...longRun, date: request.date, distanceKm: km, estimatedMinutes: Math.round(km * 6.75) },
    becomesRest: false,
    weekKmBefore: 17,
    weekKmAfter: Math.round((17 - 6.5 + km) * 10) / 10,
    safeLimitKm: null,
    request,
  }
}
const evidence = { runs: 6, checkIns: 4, uploads: 2, km: 31.5, from: '2026-09-25', to: today, excludedLinkedRuns: 2 }
let status: AiCoachStatus = { enabled: true, modelAvailable: true, consent: false, aiQuestionsLeftToday: 10 }

const actions: AiCoachActions = {
  status: async () => status,
  setConsent: async (consent) => { calls.push({ name: 'setConsent', args: [consent] }); status = { ...status, consent }; return status },
  ask: async (question): Promise<CoachAnswer> => {
    calls.push({ name: 'ask', args: [question] })
    if (/next week/i.test(question)) {
      return { reply: 'Your weekly review looks at how this week went and suggests next week’s changes.', source: 'Rules', intent: 'WeeklyReview', adjustment: null, offerWeeklyReview: true, evidence, notice: null }
    }
    return { reply: 'Here’s a shorter long run for Sunday.', source: 'Rules', intent: 'AdjustSession', adjustment: proposal({ date: '2026-10-25', kind: 'Distance', km: 4.5 }), offerWeeklyReview: false, evidence, notice: null }
  },
  preview: async (request) => { calls.push({ name: 'preview', args: [request] }); return proposal(request) },
  apply: async (request, token) => { calls.push({ name: 'apply', args: [request, token] }); return proposal(request) },
  restore: async (dates) => { calls.push({ name: 'restore', args: [dates] }) },
}

createRoot(document.getElementById('root')!).render(
  <main className="page" style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
    <h1 className="visually-hidden">Coach</h1>
    <AiCoachPanel plan={fixture} today={today} units={units} actions={actions} onOpenWeeklyReview={() => calls.push({ name: 'openWeeklyReview', args: [] })} />
  </main>,
)
