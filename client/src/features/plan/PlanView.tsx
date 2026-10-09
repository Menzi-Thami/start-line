import { useEffect, useRef, useState } from 'react'
import { buildIcs } from '../../lib/ics'
import { formatDate, formatDistance, formatDuration, formatPace, formatPaceRange, parseTimeSpan, type Units } from '../../lib/format'
import { loadDone, saveDone } from '../../lib/storage'
import type { TrainingPlan } from '../../lib/types'
import { FOCUS, ZONES } from './copy'
import { VolumeChart } from './VolumeChart'
import { WeekList } from './WeekList'

interface Props {
  plan: TrainingPlan
  units: Units
  onUnitsChange: (units: Units) => void
  shareUrl: string
  today: string
}

/** Which plan week contains today, if any. */
function weekContaining(plan: TrainingPlan, today: string): number | null {
  const week = plan.weeks.find((w) => {
    const start = Date.parse(`${w.startDate}T00:00:00Z`)
    const t = Date.parse(`${today}T00:00:00Z`)
    return t >= start && t < start + 7 * 86400000
  })
  return week?.number ?? null
}

export function PlanView({ plan, units, onUnitsChange, shareUrl, today }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const planKey = `${plan.race.name}|${plan.race.date}|${plan.startDate}`
  const [done, setDone] = useState(() => loadDone(planKey))
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const currentWeek = weekContaining(plan, today)
  const goalSeconds = parseTimeSpan(plan.goalTime) ?? 0

  useEffect(() => {
    headingRef.current?.focus()
  }, [plan])

  // Printing should show every week, not just the ones left open.
  useEffect(() => {
    const openAll = () => document.querySelectorAll<HTMLDetailsElement>('.week').forEach((d) => (d.open = true))
    window.addEventListener('beforeprint', openAll)
    return () => window.removeEventListener('beforeprint', openAll)
  }, [])

  const toggleDone = (key: string, isDone: boolean) => {
    setDone((current) => {
      const next = new Set(current)
      if (isDone) next.add(key)
      else next.delete(key)
      saveDone(planKey, next)
      return next
    })
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
  }

  const downloadCalendar = () => {
    const blob = new Blob([buildIcs(plan, units)], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${plan.race.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-plan.ics`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="plan" aria-labelledby="plan-title">
      <p className="plan-kicker">Your plan</p>
      <h2 className="plan-title" id="plan-title" ref={headingRef} tabIndex={-1}>
        {plan.race.name}
      </h2>
      <ul className="plan-facts">
        <li>
          <strong>{formatDate(plan.race.date, 'long')}</strong>
        </li>
        <li>{formatDistance(plan.race.distanceKm, units)}</li>
        <li>
          Goal <strong>{formatDuration(goalSeconds)}</strong> ({formatPace(plan.goalPaceSecondsPerKm, units)})
        </li>
        <li>
          {plan.weeks.length} weeks from {formatDate(plan.startDate)}
        </li>
      </ul>
      <p className="plan-focus">{FOCUS[plan.category]}</p>

      {plan.warnings.length > 0 && (
        <div className="callout" role="note">
          <ul>
            {plan.warnings.map((w) => (
              <li key={w.code}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="toolbar">
        <div className="pills" role="radiogroup" aria-label="Units">
          {(['km', 'mi'] as const).map((u) => (
            <label className="pill" key={u}>
              <input type="radio" name="units" checked={units === u} onChange={() => onUnitsChange(u)} />
              {u === 'km' ? 'Kilometres' : 'Miles'}
            </label>
          ))}
        </div>
        <button type="button" className="button button-quiet" onClick={copyLink}>
          {copied === 'copied' ? 'Link copied' : 'Copy link to this plan'}
        </button>
        <button type="button" className="button button-quiet" onClick={downloadCalendar}>
          Add to calendar
        </button>
        <button type="button" className="button button-quiet" onClick={() => window.print()}>
          Print
        </button>
        <span className="visually-hidden" aria-live="polite">
          {copied === 'copied' ? 'Link copied to the clipboard.' : copied === 'failed' ? 'Couldn’t copy. The link is in your address bar.' : ''}
        </span>
      </div>
      {copied === 'failed' && <p className="field-help">Your browser blocked copying. The link in the address bar is your plan.</p>}

      <section className="section" aria-labelledby="paces-title">
        <h3 id="paces-title">Your paces</h3>
        <p>Every pace comes from your goal time, so easy days stay easy and hard days hit the right effort.</p>
        <ul className="zones">
          {plan.paces.map((p) => (
            <li className="zone" key={p.zone}>
              <span className="zone-swatch" style={{ background: ZONES[p.zone].colour }} aria-hidden="true" />
              <span className="zone-name">{ZONES[p.zone].name}</span>
              <span className="zone-pace">{formatPaceRange(p.fastestSecondsPerKm, p.slowestSecondsPerKm, units)}</span>
              <span className="zone-note">{ZONES[p.zone].note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="volume-title">
        <h3 id="volume-title">Weekly distance</h3>
        <p>It builds gradually, eases off every fourth week, and drops away before race day so you start fresh.</p>
        <VolumeChart weeks={plan.weeks} units={units} currentWeek={currentWeek} />
      </section>

      <section className="section" aria-labelledby="weeks-title">
        <h3 id="weeks-title">Week by week</h3>
        <p>Tick sessions off as you go. Ticks are saved on this device only.</p>
        <WeekList weeks={plan.weeks} paces={plan.paces} units={units} currentWeek={currentWeek} done={done} onToggleDone={toggleDone} />
      </section>
    </section>
  )
}
