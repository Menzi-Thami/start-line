import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type TouchEvent } from 'react'
import type { CalendarLinks } from '../../lib/calendar-links'
import { buildIcs } from '../../lib/ics'
import { formatDate, formatDistance, formatDuration, formatPace, formatPaceRange, parseTimeSpan, type Units } from '../../lib/format'
import { planProgress } from '../../lib/plan-day'
import { ranKmByWeek, runsByDate } from '../../lib/plan-runs'
import { loadDone, saveDone } from '../../lib/storage'
import type { ActivitySummary, PersonalBest, PlanWeek, StravaStatus, TrainingPlan } from '../../lib/types'
import { Overview } from '../dashboard/Overview'
import { StrengthTab } from '../strength/StrengthTab'
import type { DoneUpdate } from '../strength/strength-progress'
import { FOCUS, PHASES, ZONES } from './copy'
import { trainingKm } from './plan-math'
import { PlanProgress } from './PlanProgress'
import { VolumeChart } from './VolumeChart'
import { WeekDays, WeekList } from './WeekList'
import { WeekTotals } from './WeekTotals'

interface Props {
  plan: TrainingPlan
  units: Units
  onUnitsChange: (units: Units) => void
  shareUrl: string
  today: string
  /** Extra actions beside Share, such as changing the answers or saving the plan to an account. */
  toolbarExtra?: ReactNode
  /** "Replan from here", under the progress ring: the banner of a rebuilt plan and the way to rebuild it. */
  replan?: ReactNode
  /** Links that subscribe Apple, Google or Outlook calendars to this plan. Without them, only the file download shows. */
  calendar?: CalendarLinks
  /** The runner's uploaded runs. Without them (signed out, or accounts off) the plan shows on its own. */
  runs?: ActivitySummary[]
  /** Opens one uploaded run. Without it, runs show in the plan but don't link anywhere. */
  onOpenRun?: (id: string) => void
  /** The runner's fastest times, for the overview. */
  bests?: PersonalBest[]
  /** How Strava sync stands, for the overview's sync line. */
  strava?: StravaStatus
  onOpenAccount?: () => void
  onOpenRuns?: () => void
}

// "This week" first: on most days it's all a runner needs. Signed-in runners get the overview of what they ran next to it.
const OVERVIEW_TAB = { id: 'overview', label: 'Overview' } as const
const PLAN_TABS = [
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'All weeks' },
  { id: 'strength', label: 'Strength' },
  { id: 'paces', label: 'Paces' },
  { id: 'progress', label: 'Progress' },
] as const
type TabId = (typeof PLAN_TABS)[number]['id'] | typeof OVERVIEW_TAB.id

/** Which plan week contains today, if any. */
function weekContaining(plan: TrainingPlan, today: string): number | null {
  const week = plan.weeks.find((w) => {
    const start = Date.parse(`${w.startDate}T00:00:00Z`)
    const t = Date.parse(`${today}T00:00:00Z`)
    return t >= start && t < start + 7 * 86400000
  })
  return week?.number ?? null
}

/** The week to show on "This week": today's, or the first one before the plan starts, or race week after it ends. */
function weekToShow(plan: TrainingPlan, today: string, currentWeek: number | null): { week: PlanWeek; when: 'now' | 'soon' | 'past' } | null {
  const first = plan.weeks[0]
  const last = plan.weeks.at(-1)
  if (!first || !last) return null
  if (currentWeek !== null) return { week: plan.weeks.find((w) => w.number === currentWeek)!, when: 'now' }
  return today < first.startDate ? { week: first, when: 'soon' } : { week: last, when: 'past' }
}

export function PlanView({ plan, units, onUnitsChange, shareUrl, today, toolbarExtra, replan, calendar, runs, onOpenRun, bests, strava, onOpenAccount, onOpenRuns }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const menuRef = useRef<HTMLDetailsElement>(null)
  const calendarRef = useRef<HTMLDetailsElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const planKey = `${plan.race.name}|${plan.race.date}|${plan.startDate}`
  const [done, setDone] = useState(() => loadDone(planKey))
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const tabs: readonly { id: TabId; label: string }[] = runs ? [PLAN_TABS[0], OVERVIEW_TAB, ...PLAN_TABS.slice(1)] : PLAN_TABS
  const [tab, setTab] = useState<TabId>('week')
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null)
  const currentWeek = weekContaining(plan, today)
  const shown = weekToShow(plan, today, currentWeek)
  const goalSeconds = parseTimeSpan(plan.goalTime) ?? 0
  const byZone = new Map(plan.paces.map((p) => [p.zone, p]))
  const progress = planProgress(plan, today)
  const byDate = useMemo(() => (runs ? runsByDate(runs) : undefined), [runs])
  const ran = useMemo(() => (runs ? ranKmByWeek(plan.weeks, runs, today) : undefined), [plan.weeks, runs, today])

  useEffect(() => {
    headingRef.current?.focus()
  }, [plan])

  // Printing shows every tab and every week, not just the ones on screen.
  useEffect(() => {
    const openAll = () => document.querySelectorAll<HTMLDetailsElement>('.week').forEach((d) => (d.open = true))
    window.addEventListener('beforeprint', openAll)
    return () => window.removeEventListener('beforeprint', openAll)
  }, [])

  // The menus are <details>, which stay open on their own; close them on Escape or a tap anywhere else.
  useEffect(() => {
    const dismiss = (event: Event) => {
      for (const menu of [menuRef.current, calendarRef.current]) {
        if (!menu?.open) continue
        const outside = event instanceof KeyboardEvent ? event.key === 'Escape' : !menu.contains(event.target as Node)
        if (outside) menu.open = false
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismiss)
    }
  }, [])

  const updateDone = (update: DoneUpdate) => {
    setDone((current) => {
      const next = update(current)
      saveDone(planKey, next)
      return next
    })
  }

  const closeMenu = () => {
    menuRef.current?.removeAttribute('open')
    calendarRef.current?.removeAttribute('open')
  }

  const copyLink = async () => {
    closeMenu()
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
  }

  const downloadCalendar = () => {
    closeMenu()
    const blob = new Blob([buildIcs(plan, units)], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${plan.race.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-plan.ics`
    link.click()
    URL.revokeObjectURL(url)
  }

  const index = tabs.findIndex((t) => t.id === tab)

  const showTab = (next: number, focus = false) => {
    const target = tabs[(next + tabs.length) % tabs.length]!
    if (target.id === tab) return
    setDirection(next > index ? 'forward' : 'back')
    setTab(target.id)
    if (focus) tabRefs.current[tabs.indexOf(target)]?.focus()
  }

  // Arrow keys move between tabs, as screen-reader users expect from a tab list.
  const onTabKey = (event: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }
    const next = moves[event.key]
    if (next === undefined) return
    event.preventDefault()
    showTab(next, true)
  }

  // A sideways swipe on a phone flips to the next or previous tab; mostly-vertical drags are scrolling.
  const onTouchStart = (event: TouchEvent) => {
    const t = event.touches[0]
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null
  }
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current
    const t = event.changedTouches[0]
    touchStart.current = null
    if (!start || !t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return
    const next = index + (dx < 0 ? 1 : -1)
    // Swiping stops at the ends rather than wrapping round, which would feel like a jump.
    if (next >= 0 && next < tabs.length) showTab(next)
  }

  const panel = (id: TabId) => ({
    id: `plan-panel-${id}`,
    role: 'tabpanel',
    'aria-labelledby': `plan-tab-${id}`,
    hidden: tab !== id,
    className: `tab-panel${tab === id && direction ? ` slide-${direction}` : ''}`,
  })

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

      <PlanProgress progress={progress} weeks={plan.weeks.length} currentWeek={currentWeek} />

      {replan}

      {plan.warnings.length > 0 && (
        <div className="callout" role="note">
          <ul>
            {plan.warnings.map((w) => (
              <li key={w.code}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="plan-actions">
        {toolbarExtra}
        <details className="menu" ref={menuRef}>
          <summary className="button button-quiet">Share</summary>
          <div className="menu-panel">
            <button type="button" className="menu-item" onClick={() => void copyLink()}>
              Copy link to this plan
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                closeMenu()
                window.print()
              }}
            >
              Print
            </button>
          </div>
        </details>
        <details className="menu" ref={calendarRef}>
          <summary className="button button-quiet">Add to calendar</summary>
          <div className="menu-panel">
            {calendar && (
              <>
                <a className="menu-item" href={calendar.apple} onClick={closeMenu}>
                  Apple Calendar <span className="menu-note">iPhone, iPad, Mac</span>
                </a>
                <a className="menu-item" href={calendar.google} target="_blank" rel="noopener noreferrer" onClick={closeMenu}>
                  Google Calendar <span className="menu-note">shows on your phone too</span>
                </a>
                <a className="menu-item" href={calendar.outlook} target="_blank" rel="noopener noreferrer" onClick={closeMenu}>
                  Outlook
                </a>
              </>
            )}
            <button type="button" className="menu-item" onClick={downloadCalendar}>
              Download a calendar file <span className="menu-note">.ics, one-off</span>
            </button>
            {calendar && <p className="menu-help">Subscribing keeps your calendar in step with your plan.</p>}
          </div>
        </details>
        <div className="pills pills-compact" role="radiogroup" aria-label="Units">
          {(['km', 'mi'] as const).map((u) => (
            <label className="pill" key={u}>
              <input type="radio" name="units" checked={units === u} onChange={() => onUnitsChange(u)} aria-label={u === 'km' ? 'Kilometres' : 'Miles'} />
              {u}
            </label>
          ))}
        </div>
        <span className="field-help" aria-live="polite">
          {copied === 'copied' ? 'Link copied.' : copied === 'failed' ? 'Your browser blocked copying. The link in the address bar is your plan.' : ''}
        </span>
      </div>

      <div className="tabs" role="tablist" aria-label="Your plan" onKeyDown={onTabKey}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`plan-tab-${t.id}`}
            className="tab"
            aria-selected={tab === t.id}
            aria-controls={`plan-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => showTab(i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-viewport" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {runs && (
          <div {...panel('overview')}>
            <Overview
              plan={plan}
              units={units}
              today={today}
              currentWeek={currentWeek}
              week={shown?.when === 'now' ? shown.week : null}
              runs={runs}
              bests={bests}
              strava={strava}
              onOpenRun={onOpenRun}
              onOpenAccount={onOpenAccount}
              onOpenRuns={onOpenRuns}
            />
          </div>
        )}
        <div {...panel('week')}>
          {progress.kind === 'race' && (
            <div className="race-day-card">
              <span className="race-day-confetti" aria-hidden="true">
                {Array.from({ length: 14 }, (_, i) => (
                  <i key={i} style={{ left: `${(i * 41) % 100}%`, animationDelay: `-${(i % 5) * 0.35}s`, animationDuration: `${1.8 + (i % 4) * 0.4}s` }} />
                ))}
              </span>
              <p className="mono">{formatDate(plan.race.date, 'long').toUpperCase()}</p>
              <h3>It’s race day.</h3>
              <p>Start at goal pace, not faster, and save something for the second half. This is what every run was for. Enjoy it.</p>
            </div>
          )}
          {shown && (
            <>
              <div className="this-week-head">
                <h3>
                  {shown.when === 'now' ? `Week ${shown.week.number} of ${plan.weeks.length}` : shown.when === 'soon' ? 'Your first week' : 'Race week'}
                  {shown.week.isCutback && <span className="tag">Easier week</span>}
                  {shown.week.isReplanned && <span className="tag">Rebuilt</span>}
                </h3>
                <p className="week-meta">
                  {shown.when === 'soon' ? `Starts ${formatDate(shown.week.startDate, 'long')}` : `From ${formatDate(shown.week.startDate)}`} ·{' '}
                  {PHASES[shown.week.phase]} · {formatDistance(trainingKm(shown.week), units)}
                </p>
              </div>
              <WeekDays week={shown.week} byZone={byZone} units={units} done={done} onDoneChange={updateDone} runs={byDate} onOpenRun={onOpenRun} />
              <p className="field-help">
                Ticks are saved on this device.{' '}
                <button type="button" className="link-button" onClick={() => showTab(tabs.findIndex((t) => t.id === 'all'))}>
                  See every week
                </button>
              </p>
            </>
          )}
        </div>

        <div {...panel('all')}>
          <p className="tab-intro">Tick sessions off as you go. Ticks are saved on this device only.</p>
          <WeekList weeks={plan.weeks} paces={plan.paces} units={units} currentWeek={currentWeek} done={done} onDoneChange={updateDone} runs={byDate} onOpenRun={onOpenRun} />
        </div>

        <div {...panel('strength')}>
          <StrengthTab plan={plan} week={shown?.week} done={done} onDoneChange={updateDone} />
        </div>

        <div {...panel('paces')}>
          <p className="tab-intro">Every pace comes from your goal time, so easy days stay easy and hard days hit the right effort.</p>
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
        </div>

        <div {...panel('progress')}>
          <p className="tab-intro">{FOCUS[plan.category]}</p>
          <h3>Weekly distance</h3>
          <p>It builds gradually, eases off every fourth week, and drops away before race day so you start fresh.</p>
          <VolumeChart weeks={plan.weeks} units={units} currentWeek={currentWeek} ran={ran} />
          {ran && ran.size > 0 && (
            <>
              <h3 className="week-totals-title">What you ran</h3>
              <WeekTotals weeks={plan.weeks} units={units} currentWeek={currentWeek} ran={ran} />
            </>
          )}
        </div>
      </div>
    </section>
  )
}
