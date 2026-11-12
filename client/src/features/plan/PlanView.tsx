import './plan-journey.css'
import './schedule-drag.css'
import { DayPreview } from './DayPreview'
import { dayStatus } from './training-status'
import { LifeHappens } from './LifeHappens'
import { WorkoutExport } from './WorkoutExport'
import { RaceWeek } from './RaceWeek'
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type TouchEvent } from 'react'
import type { CalendarLinks } from '../../lib/calendar-links'
import { buildIcs } from '../../lib/ics'
import { formatDate, formatDistance, formatDuration, formatPace, formatPaceRange, parseTimeSpan, type Units } from '../../lib/format'
import { planProgress } from '../../lib/plan-day'
import { ranKmByWeek, runsByDate } from '../../lib/plan-runs'
import { prefersMotion } from '../../lib/motion'
import { allowsSwipe, horizontalSwipe } from '../../lib/swipe'
import { loadDone, saveDone } from '../../lib/storage'
import { revealDelta, tabFade, type TabFade } from '../../lib/tab-scroll'
import type { CoachNote as CoachNoteType, ActivitySummary, PersonalBest, PlanWeek, StravaStatus, TrainingPlan } from '../../lib/types'
import { PlanAdjustment } from '../coaching/PlanAdjustment'
import { RunLog } from '../coaching/RunLog'
import { SavedRun } from '../coaching/SavedRun'
import { weekEnd } from '../../lib/plan-runs'
import { CoachNote } from '../coaching/CoachNote'
import { completedViaStrava } from '../coaching/strava-completion'
import { latestPaced } from '../coaching/fitness'
import { PacesIntro, PredictedTimes } from '../coaching/FitnessNotes'
import type { SessionCoach } from '../coaching/useCheckIns'
import { Overview } from '../dashboard/Overview'
import { StrengthTab } from '../strength/StrengthTab'
import type { DoneUpdate } from '../strength/strength-progress'
import { FOCUS, PHASES, ZONES } from './copy'
import { sessionKey, trainingKm } from './plan-math'
import { PlanProgress } from './PlanProgress'
import { OutlookCard } from './OutlookCard'
import { ProgressInsights } from './ProgressInsights'
import { WeekList } from './WeekList'
import { PlanCalendar } from './PlanCalendar'
import { WeekGlance } from './WeekGlance'
import { WeekTotals } from './WeekTotals'
import { PreparationGuide } from './PreparationGuide'

const DaySummary = lazy(() => import('./DaySummary'))

interface Props {
  preparation?: { mode: 'long' | 'race'; date: string | null } | null
  onEditStrength?: () => void
  /** Change the answers behind this plan: race, goal, days. Its own button at the top, never buried in a menu. */
  onEditPlan?: () => void
  /** The app's bar already has Progress: then Plan's own tabs are just This week and Calendar. */
  progressInBar?: boolean
  plan: TrainingPlan
  /** Just built: the race, the plan's shape and its weeks appear in turn, once, rather than all at once. */
  reveal?: boolean
  /** A tab to switch to, from the app's own navigation (Strength in the bottom bar). A new seq switches again. */
  openTab?: { id: string; seq: number }
  /** Back to Home, for the runner's own plan: an arrow above it, as an app's inner page has. */
  onBack?: () => void
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
  /** Check-ins, when this is the runner's saved plan: "How did it go?" on each run that's come round. */
  coach?: SessionCoach
  canCompleteRuns?: boolean
  /** Told whenever the open tab changes, so the app's navigation can show Progress as its own place. */
  onTabChange?: (tab: TabId) => void
  /** The account's own progress views (spans of 4, 8 or 12 weeks; training trends), shown once Progress is opened. */
  progressExtras?: ReactNode
  /** The coach's calls on the runner's saved plan; this week's shows on "This week". */
  coachNotes?: CoachNoteType[]
  /** Offered from a note about pain: rebuilds the plan after an injury. */
  onInjuryReplan?: () => Promise<void>
  /** Takes a goal the coach suggested. */
  onUseGoal?: (goalSeconds: number) => void
}

// Three destinations, with training guides kept inside the relevant view.
const PLAN_TABS = [
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'Calendar' },
  { id: 'progress', label: 'Progress' },
] as const
type TabId = (typeof PLAN_TABS)[number]['id']

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

export function PlanView({ plan, preparation, reveal = false, openTab, onBack, units, onUnitsChange, shareUrl, today, toolbarExtra, replan, calendar, runs, onOpenRun, bests, strava, onOpenAccount, onOpenRuns, coach, coachNotes, onInjuryReplan, onUseGoal, onEditStrength, onEditPlan, progressInBar = false, canCompleteRuns = true, onTabChange, progressExtras }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const preparationRef = useRef<HTMLDetailsElement>(null)
  const preparationQuery = new URLSearchParams(window.location.search)
  const preparationMode = preparation?.mode ?? preparationQuery.get('prepare')
  const [preparationOpen, setPreparationOpen] = useState(preparationMode === 'race' || preparationMode === 'long')
  // "Plan tools" opens by itself for a link straight to race-day or long-run preparation.
  const [toolboxOpen, setToolboxOpen] = useState(preparationMode === 'race' || preparationMode === 'long')
  // A run picked to move from its day: Plan tools opens on Life happens › Move a run, with that run chosen.
  const [moveRequest, setMoveRequest] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<string | null>(null)
  const [moveSequence, setMoveSequence] = useState(0)
  const menuRef = useRef<HTMLDetailsElement>(null)
  const calendarRef = useRef<HTMLDetailsElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const tabListRef = useRef<HTMLDivElement>(null)
  const [tabsFade, setTabsFade] = useState<TabFade>('none')
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const planKey = `${plan.race.name}|${plan.race.date}|${plan.startDate}`
  const [done, setDone] = useState(() => loadDone(planKey))
  const daySummaryId = useId()
  const [selectedDay, setSelectedDay] = useState<{ planKey: string; date: string; tab: TabId; trigger?: HTMLButtonElement } | null>(() => readDayRoute() ? { planKey, date: readDayRoute()!, tab: readPlanTab() } : null)
  const selectedDate = selectedDay?.planKey === planKey ? selectedDay.date : null
  const selectDate = (date: string, trigger: HTMLButtonElement) => {
    trigger.focus({ preventScroll: true })
    setSelectedDay({ planKey, date, tab, trigger })
  }
  const [detailDate, setDetailDate] = useState<string | null>(() => readDayRoute())
  const returnPosition = useRef(0)
  const previousDetail = useRef(detailDate)
  const openDay = (date: string) => {
    returnPosition.current = window.scrollY
    const url = new URL(window.location.href)
    url.searchParams.set('planTab', tab)
    if (shown) url.searchParams.set('planWeek', String(shown.week.number))
    if (tab === 'all') url.searchParams.set('month', date.slice(0, 7))
    window.history.replaceState(window.history.state, '', url)
    url.searchParams.set('day', date)
    window.history.pushState({ ...window.history.state, taperdayDay: true }, '', url)
    setDetailDate(date)
    window.scrollTo?.({ top: 0 })
  }
  const closeDay = useCallback(() => {
    if (window.history.state?.taperdayDay) { setDetailDate(null); window.history.back() }
    else {
      const url = new URL(window.location.href)
      url.searchParams.delete('day')
      window.history.replaceState(window.history.state, '', url)
      setDetailDate(null)
    }
  }, [])
  useEffect(() => {
    const wasDetail = previousDetail.current
    previousDetail.current = detailDate
    if (wasDetail && !detailDate) {
      window.scrollTo?.({ top: returnPosition.current })
      const trigger = selectedDay?.trigger ?? [...document.querySelectorAll<HTMLButtonElement>(`[data-date="${selectedDay?.date ?? ''}"]`)].find(button => !button.closest('[hidden]'))
      trigger?.focus({ preventScroll: true })
    }
  }, [detailDate, selectedDay])
  const [requestedRun, setRequestedRun] = useState<ActivitySummary | undefined>(undefined)
  const runLogRef = useRef<HTMLDivElement>(null)
  const logImportedRun = (run: ActivitySummary) => { setRequestedRun(run); requestAnimationFrame(() => runLogRef.current?.scrollIntoView({ behavior: prefersMotion() ? 'smooth' : 'auto', block: 'center' })) }
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const tabs: readonly { id: TabId; label: string }[] = PLAN_TABS
  const [tab, setTab] = useState<TabId>(() => readPlanTab())
  const [progressVisited, setProgressVisited] = useState(() => readPlanTab() === 'progress')
  useEffect(() => { onTabChange?.(tab) }, [tab, onTabChange])
  useEffect(() => {
    const onPop = () => {
      const next = readPlanTab()
      setTab(next)
      if (next === 'progress') setProgressVisited(true)
      setSelectedDay(current => current?.tab === next ? current : null)
      setDetailDate(readDayRoute())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null)
  const currentWeek = weekContaining(plan, today)
  const [weekOffset, setWeekOffset] = useState(() => {
    const requested = Number(new URLSearchParams(window.location.search).get('planWeek'))
    const requestedIndex = plan.weeks.findIndex(week => week.number === requested)
    const base = weekToShow(plan, today, weekContaining(plan, today))
    return requestedIndex < 0 ? 0 : requestedIndex - Math.max(0, plan.weeks.findIndex(week => week.number === base?.week.number))
  })
  const currentShown = weekToShow(plan, today, currentWeek)
  const weekIndex = Math.max(0, Math.min(plan.weeks.length - 1, plan.weeks.findIndex(week => week.number === currentShown?.week.number) + weekOffset))
  const shown = plan.weeks[weekIndex] ? { week: plan.weeks[weekIndex]!, when: weekOffset === 0 ? currentShown?.when : 'other' } : null
  const goalSeconds = parseTimeSpan(plan.goalTime) ?? 0
  const progress = planProgress(plan, today)
  const entries = coach?.entries ?? plan.weeks.flatMap((w) => w.sessions).flatMap((s) => { const c = coach?.get(s); return c ? [c] : [] })
  const earlierEntries = entries.filter(entry => entry.status !== 'Skipped' && (entry.date < (plan.weeks[0]?.startDate ?? plan.startDate) || entry.date > weekEnd(plan.weeks.at(-1) ?? { startDate: plan.race.date })))
  const effectiveDone = new Set(done)
  for (const entry of entries.filter((c) => !c.isAdditional)) {
    const key = sessionKey({ date: entry.date, type: entry.sessionType })
    if (entry.status === 'Skipped') effectiveDone.delete(key)
    else effectiveDone.add(key)
  }
  // A held Strava run completes its session on the calendar, the week and the progress bars while the runner hasn't
  // answered. Worked out by the API on each read, never stored, so it goes when the copy lapses.
  for (const session of plan.weeks.flatMap((w) => w.sessions)) if (completedViaStrava(session, coach)) effectiveDone.add(sessionKey(session))
  const additionalDates = entries.filter((c) => c.isAdditional && c.status !== 'Skipped').map((c) => c.date)
  const activityDates = [...runs?.filter(run => run.kind !== 'Other').map(run => run.localDate) ?? [], ...entries.filter(entry => entry.status !== 'Skipped').map(entry => entry.date)]
  const notes = plan.warnings.filter((w) => !(today >= plan.startDate && (w.code === 'foundation-first' || w.code === 'starts-later')))
  const byDate = runs ? runsByDate(runs) : undefined
  const ran = runs || coach ? ranKmByWeek(plan.weeks, runs ?? [], today, entries) : undefined

  useEffect(() => {
    if (preparationMode === 'race' || preparationMode === 'long') {
      preparationRef.current?.scrollIntoView?.({ block: 'start' })
      preparationRef.current?.querySelector('summary')?.focus({ preventScroll: true })
    } else headingRef.current?.focus()
  }, [plan, preparationMode])

  // Printing shows every tab and every week, not just the ones on screen.
  useEffect(() => {
    const openedForPrint = new Set<HTMLDetailsElement>()
    const openAll = () => {
      document.querySelectorAll<HTMLDetailsElement>('.week').forEach((d) => (d.open = true))
      document.querySelectorAll<HTMLDetailsElement>('.training-guide:not([open]), .strength-disclosure:not([open]), .plan-options:not([open])').forEach(detail => { openedForPrint.add(detail); detail.open = true })
    }
    const restoreStrength = () => { openedForPrint.forEach(detail => (detail.open = false)); openedForPrint.clear() }
    window.addEventListener('beforeprint', openAll)
    window.addEventListener('afterprint', restoreStrength)
    return () => {
      window.removeEventListener('beforeprint', openAll)
      window.removeEventListener('afterprint', restoreStrength)
    }
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

  // The row of tabs scrolls sideways when they don't all fit. Fade the edge that has more beyond it, so a tab cut off
  // at the side reads as "more this way" rather than as a mistake.
  const syncTabsFade = useCallback(() => {
    const list = tabListRef.current
    if (list) setTabsFade(tabFade(list.scrollLeft, list.clientWidth, list.scrollWidth))
  }, [])

  useEffect(() => {
    syncTabsFade()
    window.addEventListener('resize', syncTabsFade)
    const list = tabListRef.current
    const observer = typeof ResizeObserver === 'undefined' || !list ? null : new ResizeObserver(syncTabsFade)
    if (list) observer?.observe(list)
    return () => {
      window.removeEventListener('resize', syncTabsFade)
      observer?.disconnect()
    }
  }, [syncTabsFade, tabs.length])

  // Choosing a tab (a tap, an arrow key or a swipe on the plan) brings it into view if the row has it hidden.
  useEffect(() => {
    const list = tabListRef.current
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !selected || typeof list.scrollBy !== 'function') return
    const delta = revealDelta(list.getBoundingClientRect(), selected.getBoundingClientRect())
    // An end of the row with nothing beyond it has no fade, and nowhere further to scroll to.
    const atStart = list.scrollLeft <= 0
    const atEnd = list.scrollLeft + list.clientWidth >= list.scrollWidth
    if ((delta < 0 && !atStart) || (delta > 0 && !atEnd)) list.scrollBy({ left: delta, behavior: prefersMotion() ? 'smooth' : 'auto' })
  }, [tab])

  // The app's own navigation can ask for a tab (Strength in the bottom bar); each ask switches once.
  const [askedSeq, setAskedSeq] = useState<number | null>(null)
  if (openTab && openTab.seq !== askedSeq) {
    setAskedSeq(openTab.seq)
    const asked = tabs.find((t) => t.id === openTab.id)
    if (asked && asked.id !== tab) { if (asked.id === 'progress') setProgressVisited(true); setSelectedDay(null); setTab(asked.id) }
  }

  const showTab = (next: number, focus = false) => {
    const target = tabs[(next + tabs.length) % tabs.length]!
    if (target.id === tab) return
    if (target.id === 'progress') setProgressVisited(true)
    setSelectedDay(null)
    setDirection(next > index ? 'forward' : 'back')
    setTab(target.id)
    const url = new URL(window.location.href)
    url.searchParams.set('planTab', target.id)
    window.history.replaceState(window.history.state, '', url)
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
    touchStart.current = t && event.touches.length === 1 && allowsSwipe(event.target) ? { x: t.clientX, y: t.clientY } : null
  }
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current
    const t = event.changedTouches[0]
    touchStart.current = null
    if (!start || !t) return
    const direction = horizontalSwipe(start, { x: t.clientX, y: t.clientY })
    if (!direction) return
    const next = index + direction
    // Swiping stops at the ends rather than wrapping round, which would feel like a jump.
    if (next >= 0 && next < tabs.length) showTab(next)
  }

  const panel = (id: TabId) => ({
    id: `plan-panel-${id}`,
    role: 'tabpanel',
    ...(progressInBar && id === 'progress' ? { 'aria-label': 'Progress' } : { 'aria-labelledby': `plan-tab-${id}` }),
    hidden: tab !== id,
    className: `tab-panel${tab === id && direction ? ` slide-${direction}` : ''}`,
  })

  // Drag-and-drop and Move Run both use the server's existing Life Happens preview/apply flow.
  const requestMove = (from: string, to?: string) => {
    if (!coach?.adjustments?.life || from < today || from === to) return
    setMoveRequest(from)
    setMoveTarget(to ?? null)
    setMoveSequence(n => n + 1)
    setToolboxOpen(true)
    requestAnimationFrame(() => document.querySelector('.life-happens')?.scrollIntoView?.({ block: 'start', behavior: prefersMotion() ? 'smooth' : 'auto' }))
  }
  const moveEnabled = !!coach?.adjustments?.life
  const previewDate = selectedDate ?? (shown && today >= shown.week.startDate && today <= weekEnd(shown.week) ? today : shown?.week.startDate ?? today)
  const sessionsOn = (date: string) => plan.weeks.flatMap(week => week.sessions).filter(session => session.date === date)
  const statusOn = (date: string) => dayStatus(sessionsOn(date), effectiveDone, entries.filter(entry => entry.date === date), activityDates.includes(date), sessionsOn(date).some(session => completedViaStrava(session, coach)))
  // On a desktop the calendar shows today's day (or the first plan day) beside the month until a day is chosen.
  const calendarDefault = today >= plan.startDate && today <= plan.race.date ? today : plan.startDate
  const preview = (date: string) => <DayPreview id={daySummaryId} date={date} sessions={sessionsOn(date)} status={statusOn(date)} units={units} paces={plan.paces} onOpen={() => openDay(date)} />

  return (
    <section className={`plan plan-on-${tab}${reveal ? ' plan-reveal' : ''}`} aria-labelledby="plan-title">
      {detailDate && <Suspense fallback={<p role="status">Opening day…</p>}><DaySummary dedicated key={`${planKey}|${detailDate}`} id={`${daySummaryId}-detail`} date={detailDate} today={today} plan={plan} units={units} done={effectiveDone} onDoneChange={updateDone} runs={runs} coach={coach} canCompleteRuns={canCompleteRuns} onOpenRun={onOpenRun} onClose={closeDay} onMove={moveEnabled ? (moveDate) => { requestMove(moveDate); closeDay() } : undefined} /></Suspense>}
      <div hidden={detailDate !== null}>
      {onBack && (
        <button type="button" className="plan-back" aria-label="Back to Home" onClick={onBack}>
          ‹ Home
        </button>
      )}
      <p className="plan-eyebrow">{tab === 'progress' ? 'Progress' : 'Your plan'}</p>
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

      {onEditPlan && <button type="button" className="button button-quiet plan-edit-button" onClick={onEditPlan}>Edit plan</button>}
      {coach && <div ref={runLogRef} hidden={selectedDate !== null}><RunLog key={requestedRun?.id ?? 'new'} plan={plan} coach={coach} runs={runs} initialRun={requestedRun} onClose={() => setRequestedRun(undefined)} showEntries={false} /></div>}
      {coach && earlierEntries.length > 0 && <section aria-label="Earlier logged runs"><details className="disclosure"><summary>Earlier logged runs · {earlierEntries.length}</summary>{earlierEntries.map(entry => <SavedRun key={entry.id} entry={entry} coach={coach} runs={runs} showDate onOpenRun={onOpenRun} />)}</details></section>}

      {plan.outlook?.verdict === 'AtRisk' && <OutlookCard outlook={plan.outlook} onUseGoal={plan.replan && plan.suggestedGoal ? undefined : onUseGoal} />}
      {/* Notes about how the plan starts matter only until it has: once it's under way they're old news. */}
      {notes.length > 0 && (
        <div className="callout plan-notes" role="note">
          <ul>
            {notes.map((w) => (
              <li key={w.code}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="tabs tabs-frame" hidden={progressInBar && tab === 'progress'}>
        <div ref={tabListRef} className="tabs-scroll" data-fade={tabsFade} role="tablist" aria-label="Your plan" onKeyDown={onTabKey} onScroll={syncTabsFade}>
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
              hidden={progressInBar && t.id === 'progress'}
              aria-controls={`plan-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => showTab(i)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tab-viewport" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { touchStart.current = null }}>
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
              {shown.week.guidance && <p className="week-guidance">{shown.week.guidance}</p>}
              {shown.when === 'now' && coachNotes?.find((n) => n.weekStart === shown.week.startDate) && (
                <CoachNote
                  note={coachNotes.find((n) => n.weekStart === shown.week.startDate)!}
                  onInjuryReplan={onInjuryReplan}
                  fasterGoal={plan.suggestedGoal && (parseTimeSpan(plan.suggestedGoal) ?? goalSeconds) < goalSeconds ? (parseTimeSpan(plan.suggestedGoal) ?? undefined) : undefined}
                  onUseGoal={onUseGoal}
                />
              )}
              <div className="week-navigation" aria-label="Choose plan week">
                <button type="button" className="button button-quiet" aria-label="Previous week" disabled={weekIndex === 0} onClick={() => { setWeekOffset(n => n - 1); setSelectedDay(null) }}><span aria-hidden="true">‹</span><span className="week-nav-word"> Previous</span></button>
                <label className="week-jump">
                  <span className="visually-hidden">Jump to week</span>
                  <select value={weekIndex} onChange={event => { const target = Number(event.target.value); const base = plan.weeks.findIndex(week => week.number === currentShown?.week.number); setWeekOffset(target - Math.max(0, base)); setSelectedDay(null) }}>
                    {plan.weeks.map((week, i) => <option key={week.number} value={i}>{`Week ${week.number}${i === plan.weeks.length - 1 ? ' · race week' : ''}${week.number === currentWeek ? ' · this week' : ''}`}</option>)}
                  </select>
                </label>
                <span className="visually-hidden" aria-live="polite">Showing week {shown.week.number} of {plan.weeks.length}</span>
                <button type="button" className="button button-quiet" aria-label="Next week" disabled={weekIndex === plan.weeks.length - 1} onClick={() => { setWeekOffset(n => n + 1); setSelectedDay(null) }}><span className="week-nav-word">Next </span><span aria-hidden="true">›</span></button>
              </div>
              {weekOffset !== 0 && <button type="button" className="link-button week-return-current" onClick={() => { setWeekOffset(0); setSelectedDay(null) }}>
                {currentShown?.when === 'soon' ? 'Back to your first week' : currentShown?.when === 'past' ? 'Back to race week' : 'Back to this week'}
              </button>}
              <WeekGlance week={shown.week} done={effectiveDone} runs={byDate} additionalDates={additionalDates} activityDates={activityDates} today={today} units={units} onSelectDate={selectDate} selectedDate={previewDate} daySummaryId={daySummaryId} renderSelectedDay={() => preview(previewDate)} statusFor={statusOn} onRequestMove={moveEnabled ? requestMove : undefined} />
            </>
          )}
          <details className="disclosure training-guide" id="strength-workouts" aria-label="Strength workouts" open={!!shown?.week.sessions.some(session => session.type === 'Strength')}><summary>Strength workouts</summary><StrengthTab plan={plan} week={shown?.week} done={effectiveDone} onDoneChange={updateDone} onEditStrength={onEditStrength} /></details>
        </div>

        <div {...panel('all')}>
          <div className="calendar-split">
          <PlanCalendar weeks={plan.weeks} raceDate={plan.race.date} today={today} done={effectiveDone} additionalDates={additionalDates} activityDates={activityDates} historyDates={entries.map(entry => entry.date)} statusFor={statusOn} onSelectDate={selectDate} selectedDate={selectedDay?.tab === 'all' ? selectedDate : null} daySummaryId={daySummaryId} onRequestMove={moveEnabled ? requestMove : undefined} />
          {selectedDay?.tab === 'all' && selectedDate ? preview(selectedDate) : tab === 'all' && <div className="calendar-default-day"><DayPreview id={`${daySummaryId}-calendar`} date={calendarDefault} sessions={sessionsOn(calendarDefault)} status={statusOn(calendarDefault)} units={units} paces={plan.paces} onOpen={() => openDay(calendarDefault)} /></div>}
          </div>
          {!coach && <p className="tab-intro">Tick sessions off as you go. Ticks are saved on this device only.</p>}
          <details className="disclosure training-guide"><summary>Full training schedule</summary><WeekList weeks={plan.weeks} paces={plan.paces} units={units} currentWeek={currentWeek} done={effectiveDone} onDoneChange={updateDone} runs={byDate} onOpenRun={onOpenRun} onLogRun={logImportedRun} coach={coach} today={today} canCompleteRuns={canCompleteRuns} /></details>
        </div>

        <div {...panel('progress')}>
          {/* Progress does one job: how you're tracking. A headline, the outlook and one chart; the rest waits behind "More detail". */}
          <PlanProgress progress={progress} weeks={plan.weeks.length} currentWeek={currentWeek} />
          {plan.outlook && plan.outlook.verdict !== 'AtRisk' && (
            <OutlookCard outlook={plan.outlook} onUseGoal={plan.replan && plan.suggestedGoal ? undefined : onUseGoal} />
          )}
          {progressVisited && <ProgressInsights weeks={plan.weeks} units={units} currentWeek={currentWeek} ran={ran} runs={runs} today={today} statusFor={statusOn} bests={bests} onOpenRun={onOpenRun} onOpenDate={(date, trigger, period) => { const url = new URL(window.location.href); url.searchParams.set('progressWeeks', String(period)); window.history.replaceState(window.history.state, '', url); setSelectedDay({ planKey, date, tab, trigger }); openDay(date) }}
            more={<>
              {progressExtras}
              {runs && (
                <details className="disclosure training-guide" aria-label="Running insights">
                  <summary>Running insights</summary>
                  <Overview showVolumeChart={false} plan={plan} units={units} today={today} currentWeek={currentWeek}
                    week={shown?.when === 'now' ? shown.week : null} runs={runs} bests={bests} strava={strava}
                    onOpenRun={onOpenRun} onOpenAccount={onOpenAccount} onOpenRuns={onOpenRuns} />
                </details>
              )}
              <details className="disclosure training-guide" aria-label="Training paces">
                <summary>Training paces</summary>
                {latestPaced(coachNotes) ? <PacesIntro notes={coachNotes} goalSeconds={goalSeconds} /> : (
                  <p className="tab-intro">Every pace comes from your goal time, so easy days stay easy and hard days hit the right effort.</p>
                )}
                <ul className="zones">
                  {plan.paces.map(pace => (
                    <li className="zone" key={pace.zone}>
                      <span className="zone-swatch" style={{ background: ZONES[pace.zone].colour }} aria-hidden="true" />
                      <span className="zone-name">{ZONES[pace.zone].name}</span>
                      <span className="zone-pace">{formatPaceRange(pace.fastestSecondsPerKm, pace.slowestSecondsPerKm, units)}</span>
                      <span className="zone-note">{ZONES[pace.zone].note}</span>
                    </li>
                  ))}
                </ul>
              </details>
              <p className="tab-intro">{FOCUS[plan.category]}</p>
              <PredictedTimes notes={coachNotes} goalSeconds={goalSeconds} />
              {ran && ran.size > 0 && (
                <>
                  <h3 className="week-totals-title">What you ran</h3>
                  <WeekTotals weeks={plan.weeks} units={units} currentWeek={currentWeek} ran={ran} />
                </>
              )}
            </>} />}
        </div>
      </div>
      <div className="plan-tools" hidden={tab === 'progress'}>
      <RaceWeek plan={plan} today={today} />
      {/* The plan is the page; everything you might change or take away waits behind one row. */}
      <details className="disclosure plan-toolbox" open={toolboxOpen} onToggle={event => setToolboxOpen(event.currentTarget.open)}>
      <summary>Plan tools <span className="field-help">Adjust training, race-day checklist, life happens, export, share and plan options</span></summary>
      {coach?.adjustments && <details className="disclosure"><summary>Review and adjust training</summary><PlanAdjustment current={plan} units={units} actions={coach.adjustments} /></details>}
      <details ref={preparationRef} className="disclosure preparation-card" open={preparationOpen} onToggle={event => setPreparationOpen(event.currentTarget.open)}>
        <summary>{preparationMode === 'long' ? 'Long-run preparation' : 'Race-day checklist & pacing'}</summary>
        <PreparationGuide plan={plan} units={units} mode={preparationMode} date={preparation?.date ?? preparationQuery.get('date')} />
      </details>
      <LifeHappens key={`${moveRequest ?? 'life'}|${moveSequence}`} plan={plan} today={today} units={units} actions={coach?.adjustments?.life} moveDate={moveRequest} moveTarget={moveTarget} />
      <WorkoutExport plan={plan} units={units} />
      <details className="disclosure plan-options"><summary>Plan options</summary>
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
              {calendar && (
                <p className="menu-help">
                  {calendar.personal
                    ? 'Your calendar stays in step with your plan, even when it changes.'
                    : 'Subscribing keeps your calendar in step with your plan.'}
                </p>
              )}
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

        {replan}
      </details>
      </details>
      </div>

      </div>
    </section>
  )
}

function readDayRoute(): string | null {
  const date = new URLSearchParams(window.location.search).get('day')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T12:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null
}

function readPlanTab(): TabId {
  const tab = new URLSearchParams(window.location.search).get('planTab')
  return tab === 'all' || tab === 'progress' ? tab : 'week'
}
