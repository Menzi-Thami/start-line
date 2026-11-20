import { useId, useState } from 'react'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { LifeChange, LifeProposal, LifeSituation, SessionRevision, TrainingPlan } from '../../lib/types'
import { runTypeName } from '../coaching/run-types'

export interface LifeHappensActions {
  preview: (change: LifeChange) => Promise<LifeProposal>
  apply: (change: LifeChange, token: string) => Promise<void>
  restore: (dates: string[]) => Promise<void>
}

/** The day-to-day changes offered in "Change my plan". Moving a run lives on its own day (MoveRunDialog). */
export type LifeChoice = Extract<LifeSituation, 'MissedRun' | 'ShortOnTime' | 'Travelling' | 'Unwell'>

const MINUTES = [20, 30, 45, 60] as const
const HORIZON_DAYS = 14

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function weekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return addDays(iso, -((d.getUTCDay() + 6) % 7))
}

/** What a run becomes, without the "→": "rest", "easy 5 km", or for a run that keeps its type, "Long run 7 km". */
function revisedTo(r: SessionRevision, units: Units): string {
  if (r.easyKm == null) return 'rest'
  if (r.type) return `${r.type === r.originalType ? r.originalTitle : runTypeName(r.type)} ${formatDistance(r.easyKm, units)}`
  return `easy ${formatDistance(r.easyKm, units)}`
}

/** One change in words: "Tue 3 Nov · Intervals 9 km → easy 5 km", "→ rest", "→ Long run 7 km", or a move. */
function describe(r: SessionRevision, units: Units): string {
  const day = formatDate(r.date)
  if (r.movedFrom) return `${r.originalTitle} moves from ${formatDate(r.movedFrom)} to ${day}`
  return `${day} · ${r.originalTitle} ${formatDistance(r.originalKm, units)} → ${revisedTo(r, units)}`
}

/**
 * A missed run, a short day, travel or illness, turned into real changes to upcoming sessions. The runner previews them,
 * applies them, and can undo. Missed kilometres are never made up; past days and the race never change.
 */
export function LifeHappens({ plan, today, units, actions, situation }: { plan: TrainingPlan; today: string; units: Units; actions: LifeHappensActions; situation: LifeChoice }) {
  const ids = { session: useId(), minutes: useId(), from: useId(), until: useId(), days: useId(), canRun: useId() }
  const sessions = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.type !== 'Strength' && s.type !== 'Race')
  const thisWeek = weekStart(today)
  const missedChoices = sessions.filter((s) => s.date < today && s.date >= thisWeek)
  const upcoming = sessions.filter((s) => s.date >= today && s.date < addDays(today, HORIZON_DAYS))
  const [date, setDate] = useState(situation === 'MissedRun' ? (missedChoices.at(-1)?.date ?? '') : situation === 'ShortOnTime' ? (upcoming[0]?.date ?? '') : situation === 'Travelling' ? today : '')
  const [until, setUntil] = useState(situation === 'Travelling' ? addDays(today, 2) : '')
  const [minutes, setMinutes] = useState<number>(30)
  const [days, setDays] = useState(2)
  const [canRun, setCanRun] = useState(true)
  const [proposal, setProposal] = useState<{ change: LifeChange; result: LifeProposal } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean; undo?: string[] } | null>(null)

  const change = ((): LifeChange | null => {
    switch (situation) {
      case 'MissedRun': return date ? { situation, date, moveTo: null, canRun: true } : null
      case 'ShortOnTime': return date ? { situation, date, minutes, canRun: true } : null
      case 'Travelling': return date && until ? { situation, date, until, canRun } : null
      case 'Unwell': return { situation, days, canRun: true }
    }
  })()

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'That didn’t work. Try again.', error: true })
      setProposal(null)
    } finally {
      setBusy(false)
    }
  }

  // A missed key session can move to a day the server offers, keeping an easy day either side of hard sessions.
  const preview = (moveTo?: string) => {
    if (!change) return
    const asked: LifeChange = moveTo ? { ...change, moveTo } : change
    void run(async () => {
      setMessage(null)
      setProposal({ change: asked, result: await actions.preview(asked) })
    })
  }

  const apply = () => {
    if (!proposal) return
    const dates = proposal.result.changes.map((c) => c.date)
    void run(async () => {
      await actions.apply(proposal.change, proposal.result.token)
      setProposal(null)
      setMessage({ text: 'Plan updated. Your past sessions stay as they were.', undo: dates })
    })
  }

  const restore = (dates: string[]) =>
    void run(async () => {
      await actions.restore(dates)
      setProposal(null)
      setMessage({ text: 'Back as your plan first wrote it.' })
    })

  const edit = () => setProposal(null)
  const result = proposal?.result
  const needsDay = result && result.changes.length === 0 && result.moveTargets.length > 0
  return (
    <div className="life-happens-form">
      {situation === 'MissedRun' && (
        missedChoices.length === 0 ? <p className="field-help">No runs earlier this week to choose from.</p> : (
          <div className="field">
            <label className="field-label" htmlFor={ids.session}>Which run?</label>
            <select id={ids.session} className="input" value={date} onChange={(e) => { setDate(e.target.value); edit() }}>
              {missedChoices.map((s) => <option key={s.date} value={s.date}>{formatDate(s.date)} · {s.title}</option>)}
            </select>
          </div>
        )
      )}
      {situation === 'ShortOnTime' && (
        <>
          <div className="field">
            <label className="field-label" htmlFor={ids.session}>Which run?</label>
            <select id={ids.session} className="input" value={date} onChange={(e) => { setDate(e.target.value); edit() }}>
              {upcoming.map((s) => <option key={s.date} value={s.date}>{formatDate(s.date)} · {s.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={ids.minutes}>Time you have</label>
            <select id={ids.minutes} className="input" value={minutes} onChange={(e) => { setMinutes(Number(e.target.value)); edit() }}>
              {MINUTES.map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </div>
        </>
      )}
      {situation === 'Travelling' && (
        <>
          <div className="life-happens-dates">
            <div className="field">
              <label className="field-label" htmlFor={ids.from}>From</label>
              <input id={ids.from} type="date" className="input" min={today} max={addDays(today, HORIZON_DAYS - 1)} value={date} onChange={(e) => { setDate(e.target.value); edit() }} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={ids.until}>Until</label>
              <input id={ids.until} type="date" className="input" min={date || today} max={addDays(today, HORIZON_DAYS - 1)} value={until} onChange={(e) => { setUntil(e.target.value); edit() }} />
            </div>
          </div>
          <label className="session-done" htmlFor={ids.canRun}>
            <input id={ids.canRun} type="checkbox" checked={canRun} onChange={(e) => { setCanRun(e.target.checked); edit() }} /> I can still run easy
          </label>
        </>
      )}
      {situation === 'Unwell' && (
        <>
          <div className="field">
            <label className="field-label" htmlFor={ids.days}>Days to rest, from today</label>
            <select id={ids.days} className="input" value={days} onChange={(e) => { setDays(Number(e.target.value)); edit() }}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'}</option>)}
            </select>
          </div>
          <p className="field-help">Don’t run with a fever or chest symptoms, and see a doctor if it doesn’t settle.</p>
        </>
      )}

      {!result && (
        <button type="button" className="button button-quiet" disabled={busy || !change} onClick={() => preview()}>
          {busy ? 'Working it out…' : 'Show what changes'}
        </button>
      )}

      {result && (
        <div className="callout life-happens-preview">
          {needsDay ? (
            <>
              <p>Choose a day for it. Each keeps an easy day either side of a hard session:</p>
              <div className="pills" role="group" aria-label="Move to">
                {result.moveTargets.map((d) => (
                  <button key={d} type="button" className="button button-quiet" disabled={busy} onClick={() => preview(d)}>
                    {formatDate(d)}
                  </button>
                ))}
              </div>
            </>
          ) : result.changes.length === 0 ? (
            <p>{situation === 'MissedRun' ? 'Let it go and carry on from here: missed kilometres are never made up.' : 'Nothing needs to change.'}</p>
          ) : (
            <>
              <h4>This will change</h4>
              <ul>
                {result.changes.filter((c) => !(c.easyKm == null && result.changes.some((m) => m.movedFrom === c.date))).map((c) => (
                  <li key={`${c.date}|${c.movedFrom ?? ''}`}>{describe(c, units)}</li>
                ))}
              </ul>
              <p className="field-help">This is a preview. Your plan hasn’t changed.</p>
              <div className="submit-row">
                <button type="button" className="button" disabled={busy} onClick={apply}>{busy ? 'Applying…' : 'Apply these changes'}</button>
                <button type="button" className="button button-quiet" disabled={busy} onClick={edit}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {message && (
        <p className={message.error ? 'field-error' : 'field-help'} role={message.error ? 'alert' : 'status'}>
          {message.text}{' '}
          {message.undo && (
            <button type="button" className="link-button" disabled={busy} onClick={() => restore(message.undo!)}>
              Undo
            </button>
          )}
        </p>
      )}
    </div>
  )
}

/** Days ahead that a change has altered, each with a way back to what the plan first wrote. */
export function ChangedDays({ plan, today, units, actions }: { plan: TrainingPlan; today: string; units: Units; actions: LifeHappensActions }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = (plan.adjustments ?? []).filter((r) => r.date >= today)
  if (changed.length === 0) return null
  const restore = async (date: string) => {
    setBusy(true)
    setError(null)
    try {
      await actions.restore([date])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="life-happens-changed">
      <h4>Changed days ahead</h4>
      <ul>
        {changed.filter((c) => !(c.easyKm == null && changed.some((m) => m.movedFrom === c.date))).map((c) => (
          <li key={`${c.date}|${c.movedFrom ?? ''}`}>
            <span>{describe(c, units)}</span>
            <button type="button" className="link-button" disabled={busy} onClick={() => void restore(c.date)} aria-label={`Restore ${formatDate(c.date)}`}>
              Restore
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  )
}
