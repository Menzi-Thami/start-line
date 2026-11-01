import { useId, useState } from 'react'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { LifeChange, LifeProposal, LifeSituation, SessionRevision, TrainingPlan } from '../../lib/types'

export interface LifeHappensActions {
  preview: (change: LifeChange) => Promise<LifeProposal>
  apply: (change: LifeChange, token: string) => Promise<void>
  restore: (dates: string[]) => Promise<void>
}

const SITUATIONS: readonly { value: LifeSituation; label: string }[] = [
  { value: 'MissedRun', label: 'Missed a run' },
  { value: 'ShortOnTime', label: 'Short on time' },
  { value: 'Travelling', label: 'Travelling' },
  { value: 'Unwell', label: 'Not feeling well' },
  { value: 'MoveLongRun', label: 'Move my long run' },
]
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

/** One change in words: "Tue 3 Nov · Intervals 9 km → easy 5 km", "→ rest", or a move. */
function describe(r: SessionRevision, units: Units): string {
  const day = formatDate(r.date)
  if (r.movedFrom) return `${r.originalTitle} moves from ${formatDate(r.movedFrom)} to ${day}`
  return `${day} · ${r.originalTitle} ${formatDistance(r.originalKm, units)} → ${r.easyKm == null ? 'rest' : `easy ${formatDistance(r.easyKm, units)}`}`
}

/**
 * Life happens: a missed run, a short day, travel, illness or a long run that has to move, turned into real changes to
 * upcoming sessions. The runner previews them, applies them, and can put any day back as the plan first wrote it. Hard
 * sessions keep an easy day either side; missed kilometres are never made up; past days and the race never change.
 */
export function LifeHappens({ plan, today, units, actions }: { plan: TrainingPlan; today: string; units: Units; actions?: LifeHappensActions }) {
  const ids = { session: useId(), minutes: useId(), from: useId(), until: useId(), days: useId(), canRun: useId() }
  const [situation, setSituation] = useState<LifeSituation | null>(null)
  const [date, setDate] = useState('')
  const [until, setUntil] = useState('')
  const [minutes, setMinutes] = useState<number>(30)
  const [days, setDays] = useState(2)
  const [canRun, setCanRun] = useState(true)
  const [proposal, setProposal] = useState<{ change: LifeChange; result: LifeProposal } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean; undo?: string[] } | null>(null)

  const sessions = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.type !== 'Strength' && s.type !== 'Race')
  const thisWeek = weekStart(today)
  const missedChoices = sessions.filter((s) => s.date < today && s.date >= thisWeek)
  const upcoming = sessions.filter((s) => s.date >= today && s.date < addDays(today, HORIZON_DAYS))
  const changed = (plan.adjustments ?? []).filter((r) => r.date >= today)

  if (!actions) {
    return (
      <details className="disclosure life-happens">
        <summary>Life happens · change of plans?</summary>
        <p className="field-help">Save this plan to move, shorten or rest sessions when life gets in the way.</p>
      </details>
    )
  }

  const pick = (next: LifeSituation) => {
    setSituation(next)
    setProposal(null)
    setMessage(null)
    setDate(next === 'MissedRun' ? (missedChoices.at(-1)?.date ?? '') : next === 'ShortOnTime' ? (upcoming[0]?.date ?? '') : next === 'Travelling' ? today : '')
    setUntil(next === 'Travelling' ? addDays(today, 2) : '')
  }

  const changeFor = (moveTo?: string): LifeChange | null => {
    switch (situation) {
      case 'MissedRun': return date ? { situation, date, moveTo: moveTo ?? null, canRun: true } : null
      case 'ShortOnTime': return date ? { situation, date, minutes, canRun: true } : null
      case 'Travelling': return date && until ? { situation, date, until, canRun } : null
      case 'Unwell': return { situation, days, canRun: true }
      case 'MoveLongRun': return { situation, moveTo: moveTo ?? null, canRun: true }
      default: return null
    }
  }

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

  const preview = (moveTo?: string) => {
    const change = changeFor(moveTo)
    if (!change) return
    void run(async () => {
      setMessage(null)
      setProposal({ change, result: await actions.preview(change) })
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

  const result = proposal?.result
  const needsDay = result && result.changes.length === 0 && result.moveTargets.length > 0
  return (
    <details className="disclosure life-happens">
      <summary>Life happens · change of plans?</summary>
      <p className="field-help">Say what happened. You’ll see exactly what changes before anything does, and you can put it back.</p>
      <div className="pills" role="group" aria-label="What happened">
        {SITUATIONS.map((s) => (
          <button key={s.value} type="button" className="button button-quiet" aria-pressed={situation === s.value} onClick={() => pick(s.value)}>
            {s.label}
          </button>
        ))}
      </div>

      {situation && (
        <div className="life-happens-form">
          {situation === 'MissedRun' && (
            missedChoices.length === 0 ? <p className="field-help">No runs earlier this week to choose from.</p> : (
              <div className="field">
                <label className="field-label" htmlFor={ids.session}>Which run?</label>
                <select id={ids.session} className="input" value={date} onChange={(e) => { setDate(e.target.value); setProposal(null) }}>
                  {missedChoices.map((s) => <option key={s.date} value={s.date}>{formatDate(s.date)} · {s.title}</option>)}
                </select>
              </div>
            )
          )}
          {situation === 'ShortOnTime' && (
            <>
              <div className="field">
                <label className="field-label" htmlFor={ids.session}>Which run?</label>
                <select id={ids.session} className="input" value={date} onChange={(e) => { setDate(e.target.value); setProposal(null) }}>
                  {upcoming.map((s) => <option key={s.date} value={s.date}>{formatDate(s.date)} · {s.title}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={ids.minutes}>Time you have</label>
                <select id={ids.minutes} className="input" value={minutes} onChange={(e) => { setMinutes(Number(e.target.value)); setProposal(null) }}>
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
                  <input id={ids.from} type="date" className="input" min={today} max={addDays(today, HORIZON_DAYS - 1)} value={date} onChange={(e) => { setDate(e.target.value); setProposal(null) }} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={ids.until}>Until</label>
                  <input id={ids.until} type="date" className="input" min={date || today} max={addDays(today, HORIZON_DAYS - 1)} value={until} onChange={(e) => { setUntil(e.target.value); setProposal(null) }} />
                </div>
              </div>
              <label className="session-done" htmlFor={ids.canRun}>
                <input id={ids.canRun} type="checkbox" checked={canRun} onChange={(e) => { setCanRun(e.target.checked); setProposal(null) }} /> I can still run easy
              </label>
            </>
          )}
          {situation === 'Unwell' && (
            <>
              <div className="field">
                <label className="field-label" htmlFor={ids.days}>Days to rest, from today</label>
                <select id={ids.days} className="input" value={days} onChange={(e) => { setDays(Number(e.target.value)); setProposal(null) }}>
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'}</option>)}
                </select>
              </div>
              <p className="field-help">Don’t run with a fever or chest symptoms. If it doesn’t settle in a few days, see a doctor.</p>
            </>
          )}
          {situation === 'MoveLongRun' && <p className="field-help">Taperday offers the days this week where it fits, with an easy day either side of hard sessions.</p>}

          <button type="button" className="button button-quiet" disabled={busy || !changeFor()} onClick={() => preview()}>
            {busy && !proposal ? 'Working it out…' : 'Show what changes'}
          </button>
        </div>
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
            <p>
              {situation === 'MissedRun'
                ? 'Let it go: carry on with the plan from here. Missed kilometres are never made up, and there’s no safe day to move a key session to.'
                : 'Nothing needs to change.'}
            </p>
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
                <button type="button" className="button button-quiet" disabled={busy} onClick={() => setProposal(null)}>Cancel</button>
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

      {changed.length > 0 && (
        <div className="life-happens-changed">
          <h4>Changed days ahead</h4>
          <ul>
            {changed.filter((c) => !(c.easyKm == null && changed.some((m) => m.movedFrom === c.date))).map((c) => (
              <li key={`${c.date}|${c.movedFrom ?? ''}`}>
                <span>{describe(c, units)}</span>
                <button type="button" className="link-button" disabled={busy} onClick={() => restore([c.date])} aria-label={`Restore ${formatDate(c.date)}`}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  )
}
