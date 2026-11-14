// Test-only page (served by Vite for Playwright, never in client/dist): the real journey screens with a synthetic,
// in-memory journey standing in for the API. ?scene= picks the starting point; ?today= the runner's date.
import './app-styles'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext, accountsOff } from '../../src/app/auth-context'
import { addDays } from '../../src/lib/format'
import type { TrainingPlan } from '../../src/lib/types'
import { JourneyHomeCard } from '../../src/features/journey/JourneyHomeCard'
import { JourneyPanel } from '../../src/features/journey/JourneyPanel'
import { RunningJourney } from '../../src/features/journey/RunningJourney'
import { chapter, journeyOf, maintenance, PLAN_ID, raceResult, recap, recovery } from '../../src/features/journey/journey-fixtures'
import { recoveryDayMap } from '../../src/features/journey/journey-model'
import type { Journey, RecoveryPlan } from '../../src/features/journey/types'
import type { JourneyActions } from '../../src/features/journey/useJourney'
import { PlanCalendar } from '../../src/features/plan/PlanCalendar'
import { dayStatus } from '../../src/features/plan/training-status'

const params = new URLSearchParams(window.location.search)
const scene = params.get('scene') ?? 'training-complete'
const today = params.get('today') ?? '2026-11-14'
const longName = params.get('long') === '1'
const raceName = longName ? 'The Very Long Named Coastal Sunrise Half Marathon and Community Fun Run 2026' : 'Hoka Half Marathon'
const award = (kind: 'TrainingComplete' | 'RaceFinished', celebratedAt: string | null = null) =>
  ({ id: `award-${kind}`, kind, planId: PLAN_ID, earnedOn: kind === 'RaceFinished' ? '2026-11-15' : '2026-11-14', awardedAt: '2026-11-14T10:00:00Z', celebratedAt })
const seen = '2026-11-14T11:00:00Z'

function initial(): Journey {
  const done = chapter({ raceName, achievements: [award('TrainingComplete', scene === 'training-complete' ? null : seen)] })
  const passed = { ...done, training: recap({ raceDatePassed: true }) }
  const finished = { ...passed, raceResult: raceResult(), lifecycle: 'RaceCompleted' as const, achievements: [award('TrainingComplete', seen), award('RaceFinished', seen)] }
  const past = chapter({ planId: '22222222-2222-4222-8222-222222222222', raceName: 'Parkrun 10K Challenge', raceDate: '2026-04-12', distanceKm: 10, status: 'Archived', lifecycle: 'Archived', startDate: '2026-01-19',
    training: recap({ scheduledRuns: 30, confirmedRuns: 30, weeks: 12, recordedKm: 182.3, raceDatePassed: true }), raceResult: raceResult({ planId: '22222222-2222-4222-8222-222222222222', raceDate: '2026-04-12', finishTime: '00:48:05', distanceKm: 10, versusGoal: '-00:01:55', goalTime: '00:50:00' }),
    achievements: [{ ...award('TrainingComplete', seen), id: 'past-training' }, { ...award('RaceFinished', seen), id: 'past-race', earnedOn: '2026-04-12' }] })
  switch (scene.replace(/^home-/, '')) {
    case 'race-result': return journeyOf([passed])
    case 'incomplete': return journeyOf([{ ...passed, achievements: [], lifecycle: 'RacePending', training: recap({ confirmedRuns: 22, allConfirmed: false, raceDatePassed: true, recordedKm: null, recordedRuns: 0, longestRecordedKm: null, longestRecordedOn: null, cutShortRuns: 3, skippedRuns: 5, unansweredRuns: 8 }), weeks: null }])
    case 'recovery': return journeyOf([{ ...finished, lifecycle: 'Recovering' }], { recovery: recovery({ checkIns: [{ date: '2026-11-17', feeling: 'StillSore', redFlags: [], note: null }] }) })
    case 'pain': return journeyOf([{ ...finished, lifecycle: 'Recovering' }], { recovery: recovery({ seekCare: true, phase: 'SeekCare', readiness: 'PainOrInjury', safetyMessage: 'Pain that is severe or lasting, trouble walking, marked swelling, dark urine, fainting or chest pain need a doctor or physio today. For chest pain or fainting, call emergency services. Taperday won’t suggest exercise until you’ve been checked.', checkIns: [{ date: today, feeling: 'PainOrInjury', redFlags: ['SeverePain'], note: null }], days: recovery().days.map(d => d.date >= today ? { ...d, kind: 'SeekCare', phase: 'SeekCare', title: 'Get checked', guidance: 'No exercise until you’ve been checked.', minMinutes: null, maxMinutes: null, gated: false } : d) }) })
    case 'recovered': return journeyOf([{ ...finished, lifecycle: 'Recovered' }], { recovery: recovery({ status: 'Completed', endedOn: '2026-11-25', canComplete: true }) })
    case 'maintenance': return journeyOf([{ ...finished, lifecycle: 'Recovered' }], { recovery: recovery({ status: 'Completed', endedOn: '2026-11-25' }), maintenance: maintenance() })
    case 'journey': return journeyOf([finished, past], { recovery: recovery({ status: 'Completed', endedOn: '2026-11-25' }) })
    case 'empty-journey': return journeyOf([])
    default: return journeyOf([done])
  }
}

const plan = { race: { name: raceName, date: '2026-11-15' }, startDate: '2026-08-24', weeks: [] } as unknown as TrainingPlan

/** A stand-in for the API: each change is applied as the server would, then the screen reloads from it. */
function useFakeJourney() {
  const [journey, setJourney] = useState(initial)
  const update = (change: (j: Journey) => Journey) => setJourney(j => change(structuredClone(j)))
  const withRecovery = (change: (r: RecoveryPlan) => RecoveryPlan) => { let next!: RecoveryPlan; update(j => { next = change(j.recovery!); return { ...j, recovery: next } }); return Promise.resolve(next ?? journey.recovery!) }
  const actions: JourneyActions = {
    refresh: () => undefined,
    celebrated: (id) => { update(j => ({ ...j, chapters: j.chapters.map(c => ({ ...c, achievements: c.achievements.map(a => a.id === id ? { ...a, celebratedAt: seen } : a) })) })); return Promise.resolve() },
    saveRaceResult: (planId, body) => {
      const result = raceResult({ outcome: body.outcome, raceDate: body.raceDate ?? '2026-11-15', finishTime: body.finishTime ?? null, distanceKm: body.distanceKm ?? null, versusGoal: body.finishTime === '01:52:10' ? '-00:02:50' : null, note: body.note ?? null, version: `v${Date.now()}` })
      update(j => ({ ...j, chapters: j.chapters.map(c => c.planId !== planId ? c : {
        ...c, raceResult: result, lifecycle: body.outcome === 'Finished' ? 'RaceCompleted' : 'RaceNotCompleted',
        achievements: [...c.achievements.filter(a => a.kind !== 'RaceFinished'), ...(body.outcome === 'Finished' ? [award('RaceFinished')] : [])],
      }) }))
      return Promise.resolve(result)
    },
    deleteRaceResult: (planId) => { update(j => ({ ...j, chapters: j.chapters.map(c => c.planId !== planId ? c : { ...c, raceResult: null, achievements: c.achievements.filter(a => a.kind !== 'RaceFinished') }) })); return Promise.resolve() },
    startRecovery: (body) => { const r = recovery({ effort: body.effort, preference: body.preference, raceDate: body.raceDate, seekCare: (body.redFlags?.length ?? 0) > 0 }); update(j => ({ ...j, recovery: r })); return Promise.resolve(r) },
    changeRecovery: (_, change) => withRecovery(r => change.action === 'Complete' ? { ...r, status: 'Completed', endedOn: today }
      : change.action === 'Pause' ? { ...r, status: 'Paused', pauses: [{ from: today, to: null }] }
      : change.action === 'Resume' ? { ...r, status: 'Active' }
      : change.action === 'End' ? { ...r, status: 'Ended', endedOn: today }
      : change.action === 'Extend' ? { ...r, extraDays: r.extraDays + (change.extendDays ?? 0), endsOn: addDays(r.endsOn, change.extendDays ?? 0) }
      : { ...r, ...(change.preference ? { preference: change.preference } : {}), ...(change.effort ? { effort: change.effort } : {}) }),
    checkIn: (_, body) => withRecovery(r => ({
      ...r, readiness: body.feeling, canComplete: body.feeling === 'GoodToGo', seekCare: body.feeling === 'PainOrInjury' || (body.redFlags?.length ?? 0) > 0,
      checkIns: [...r.checkIns.filter(c => c.date !== (body.date ?? today)), { date: body.date ?? today, feeling: body.feeling, redFlags: body.redFlags ?? [], note: null }],
    })),
    startMaintenance: (body) => { update(j => ({ ...j, maintenance: maintenance({ daysPerWeek: body.daysPerWeek, runDays: body.runDays ?? [] }) })); return Promise.resolve() },
    endMaintenance: () => { update(j => ({ ...j, maintenance: null })); return Promise.resolve() },
  }
  return { journey, actions }
}

// The history screen loads through the real hook and API client; answered here from the same synthetic journey.
const auth = { ...accountsOff, enabled: true, account: { name: 'Sam Runner', email: null }, getToken: () => Promise.resolve('test-token') }
const realFetch = window.fetch.bind(window)
const served: { journey: Journey } = { journey: initial() }
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.includes('/api/v1/me/journey/plans/')) {
    const id = url.split('/').pop()!
    const found = served.journey.chapters.find(c => c.planId === id)
    return Promise.resolve(found ? Response.json(found) : new Response(null, { status: 404 }))
  }
  if (url.includes('/api/v1/me/journey')) return Promise.resolve(params.get('fail') === '1' ? new Response(null, { status: 503 }) : Response.json(served.journey))
  return realFetch(input, init)
}

export function Harness() {
  const { journey, actions } = useFakeJourney()
  useEffect(() => { served.journey = journey }, [journey])
  const state = { kind: 'ready' as const, journey, refreshFailed: false }
  if (scene === 'journey' || scene === 'empty-journey') {
    return <div className="plan"><section className="progress-extra" aria-labelledby="progress-journey"><h3 id="progress-journey">Your running journey</h3><RunningJourney units="km" today={today} runDays={['Tuesday', 'Thursday', 'Saturday']} /></section></div>
  }
  if (scene === 'calendar') {
    const days = recoveryDayMap(recovery())
    const weeks = [
      { number: 1, startDate: '2026-11-02', sessions: [{ date: '2026-11-04', type: 'Easy', title: 'Easy run', distanceKm: 5 }, { date: '2026-11-07', type: 'LongRun', title: 'Long run', distanceKm: 12 }] },
      { number: 2, startDate: '2026-11-09', sessions: [{ date: '2026-11-10', type: 'Easy', title: 'Easy run', distanceKm: 5 }, { date: '2026-11-15', type: 'Race', title: 'Race', distanceKm: 21.1 }] },
    ] as unknown as TrainingPlan['weeks']
    const sessions = weeks.flatMap(w => w.sessions)
    return (
      <div className="plan">
        <PlanCalendar weeks={weeks} planStart="2026-11-04" raceDate="2026-11-15" today={today} done={new Set(['2026-11-04|Easy', '2026-11-07|LongRun', '2026-11-10|Easy'])} activityDates={['2026-11-29']}
          historyDates={[...days.keys(), '2026-11-29']}
          statusFor={(date) => dayStatus(sessions.filter(s => s.date === date), new Set(['2026-11-04|Easy', '2026-11-07|LongRun', '2026-11-10|Easy']), [], date === '2026-11-29', false, date >= '2026-11-04' && date <= '2026-11-15', days.get(date))}
          onSelectDate={() => undefined} />
      </div>
    )
  }
  if (scene.startsWith('home-')) {
    return <div className="home"><div className="home-panel home-focus"><JourneyHomeCard journey={{ state, actions }} today={today} currentPlanId={PLAN_ID} onOpenPlan={() => undefined} onNewRace={() => undefined} /></div></div>
  }
  return <div className="plan"><JourneyPanel plan={plan} today={today} units="km" planId={PLAN_ID} journey={{ state, actions }} local={{ total: 38, completed: 38, provisional: 0, distanceKm: 312.5, weeks: 12, allConfirmed: true, trainingEnded: true, racePassed: false, earned: true, visible: true }}
    runDays={['Tuesday', 'Thursday', 'Saturday', 'Sunday']} onNewRace={() => undefined} onOpenRacePrep={() => undefined} /></div>
}

createRoot(document.getElementById('root')!).render(
  <AuthContext.Provider value={auth}>
    <main className="page" style={{ paddingTop: 24 }}><Harness /></main>
  </AuthContext.Provider>,
)
