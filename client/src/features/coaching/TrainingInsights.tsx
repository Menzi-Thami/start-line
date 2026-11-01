import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDistance, formatPace, formatShortDay as shortDay, type Units } from '../../lib/format'
import type { InsightGap, NextStepReason, TrainingInsights as Insights, TrainingTrends } from '../../lib/types'
import { TITLES } from './verdict-titles'

type State = { kind: 'loading' } | { kind: 'ready'; data: Insights } | { kind: 'error'; message: string }

interface Props {
  planId: string
  units: Units
  /** Changes when a check-in or run changes, so the trends follow. */
  refreshKey?: string | number
  /** Opens the weekly coaching review, where a change is accepted or declined. */
  onReview?: () => void
}

function isInsights(value: unknown): value is Insights {
  const data = value as Partial<Insights> | null
  const trends = data?.trends as Partial<TrainingTrends> | undefined
  return typeof data === 'object' && data !== null && !Array.isArray(data) && typeof trends === 'object' && trends !== null
    && Array.isArray(trends.weeks) && typeof trends.load === 'object' && typeof trends.adherence === 'object'
    && typeof trends.easyPace === 'object' && Array.isArray(trends.gaps) && Array.isArray(data.decisions)
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

const NEXT: Record<TrainingTrends['nextStep'], string> = {
  BuildAsPlanned: 'Carry on as planned',
  HoldVolume: 'Hold your distance this week',
  EaseOff: 'Ease off and look after it',
  LogMore: 'Log a few more runs first',
}

const GAPS: Record<InsightGap, string> = {
  FewWeeks: 'Fewer than three of the last eight weeks have runs, so the trends are rough.',
  MissingDistances: 'Some runs were ticked without a distance: they count as runs, not kilometres.',
  StravaWindow: 'Strava runs count here for the 7 days Taperday may keep them. Upload a file to keep a run in your trends for good.',
  FewEasyRuns: 'Easy pace needs at least two easy runs, rated 1–4 or planned as easy, in each four-week window.',
  UnloggedSessions: 'Some planned sessions have no check-in yet. Tick them or mark them skipped so consistency is right.',
}

function why(reason: NextStepReason, trends: TrainingTrends, units: Units): string {
  const { load, adherence } = trends
  switch (reason) {
    case 'Pain':
      return 'You reported pain that changed how you ran in the last two weeks. Rest or run easy until it settles, and see a professional if it doesn’t.'
    case 'LoadSpike':
      return `Your last 7 days (${formatDistance(load.recentKm, units)}) are ${load.changePercent}% above your average week before that (${formatDistance(load.baselineWeeklyKm, units)}). Jumps like that raise injury risk, so let your body catch up before adding more.`
    case 'MissedSessions':
      return `You ran ${adherence.done} of ${adherence.planned} planned sessions in the last four weeks. Repeating a week you can manage beats building on gaps.`
    case 'SparseLogs':
      return 'There isn’t enough logged running yet to judge a trend. Tick sessions or upload runs and this will fill in.'
    case 'OnTrack':
      return 'Your distance is steady against your recent weeks and you’re running most of your sessions.'
  }
}

function loadWords(trends: TrainingTrends, units: Units): string {
  const { load } = trends
  if (load.signal === 'NotEnoughHistory') return `${formatDistance(load.recentKm, units)} in the last 7 days. Three weeks of running before that will show how it compares.`
  const change = load.changePercent ?? 0
  const direction = change === 0 ? 'the same as' : `${Math.abs(change)}% ${change > 0 ? 'above' : 'below'}`
  return `${formatDistance(load.recentKm, units)} in the last 7 days, ${direction} your average week before that (${formatDistance(load.baselineWeeklyKm, units)}).`
}

function paceWords(trends: TrainingTrends, units: Units): string {
  const pace = trends.easyPace
  if (pace.recentSecondsPerKm == null || pace.earlierSecondsPerKm == null || pace.changeSecondsPerKm == null) {
    return `Not enough easy runs to compare yet (${pace.recentRuns} in the last four weeks, ${pace.earlierRuns} in the four before).`
  }
  const change = Math.abs(pace.changeSecondsPerKm)
  const verdict = change < 3 ? 'about the same as' : pace.changeSecondsPerKm < 0 ? `${change}s/km faster than` : `${change}s/km slower than`
  const heart = pace.recentHeartRate != null && pace.earlierHeartRate != null
    ? ` Average heart rate ${pace.recentHeartRate} bpm, from ${pace.earlierHeartRate}.`
    : ''
  return `Easy runs averaged ${formatPace(pace.recentSecondsPerKm, units)}, ${verdict} the four weeks before (${formatPace(pace.earlierSecondsPerKm, units)}), from ${plural(pace.recentRuns, 'run')} and ${plural(pace.earlierRuns, 'run')}.${heart}`
}

/** Eight weeks of distance as a small bar row, with a table of the same figures for screen readers. */
function WeekBars({ trends, units }: { trends: TrainingTrends; units: Units }) {
  const max = Math.max(1, ...trends.weeks.map((w) => Math.max(w.ranKm, w.plannedKm)))
  return (
    <figure className="insights-weeks">
      <div className="insights-bars" aria-hidden="true">
        {trends.weeks.map((week) => (
          <span key={week.weekStart} className={week.isCurrent ? 'insights-bar is-current' : 'insights-bar'}>
            <span className="insights-bar-planned" style={{ blockSize: `${(week.plannedKm / max) * 100}%` }} />
            <span className="insights-bar-ran" style={{ blockSize: `${(week.ranKm / max) * 100}%` }} />
          </span>
        ))}
      </div>
      <figcaption className="field-help">Last 8 weeks: run (solid) against planned (outline). This week counts up to today.</figcaption>
      <div className="visually-hidden">
        <table>
          <caption>Distance by week</caption>
          <thead>
            <tr>
              <th scope="col">Week of</th>
              <th scope="col">Run</th>
              <th scope="col">Planned</th>
            </tr>
          </thead>
          <tbody>
            {trends.weeks.map((week) => (
              <tr key={week.weekStart}>
                <th scope="row">{shortDay(week.weekStart)}{week.isCurrent ? ' (so far)' : ''}</th>
                <td>{formatDistance(week.ranKm, units)}</td>
                <td>{formatDistance(week.plannedKm, units)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

/**
 * Training trends for the plan on screen: load, consistency and easy pace, each with the figures behind it and what's
 * missing. The next step is advice: any change to the plan goes through the weekly review, accepted or declined there,
 * and every answer is listed in the coaching history below.
 */
export function TrainingInsights({ planId, units, refreshKey, onReview }: Props) {
  const auth = useAuth()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.trainingInsights(token, planId) : Promise.reject(new Error('Sign in to see your trends.'))))
      .then((data) => {
        if (!isInsights(data)) throw new Error('Training trends aren’t available right now.')
        if (!cancelled) setState({ kind: 'ready', data })
      })
      .catch((error: unknown) => !cancelled && setState({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' }))
    return () => {
      cancelled = true
    }
  }, [auth, planId, refreshKey])

  if (state.kind === 'loading') return <p className="field-help">Working out your trends…</p>
  if (state.kind === 'error') return <p className="field-help">{state.message}</p>

  const { trends, decisions } = state.data
  const { adherence } = trends
  return (
    <div className="insights">
      <div className={`insights-next is-${trends.nextStep}`}>
        <p className="insights-next-label">Next step</p>
        <h3 className="insights-next-title">{NEXT[trends.nextStep]}</h3>
        <ul className="insights-why">
          {trends.reasons.map((reason) => (
            <li key={reason}>{why(reason, trends, units)}</li>
          ))}
        </ul>
        {onReview && trends.nextStep !== 'LogMore' && (
          <button type="button" className="link-button" onClick={onReview}>
            Review this week’s coaching →
          </button>
        )}
        <p className="field-help">Taperday never changes your plan on its own: you accept or decline each change.</p>
      </div>

      <dl className="insights-facts">
        <div>
          <dt>Load</dt>
          <dd>{loadWords(trends, units)}</dd>
        </div>
        <div>
          <dt>Consistency</dt>
          <dd>
            {adherence.planned === 0
              ? 'No planned sessions in the last four weeks yet.'
              : `${adherence.done} of ${adherence.planned} planned sessions run in the last four weeks · ${adherence.skipped} skipped · ${adherence.unlogged} not logged.`}
          </dd>
        </div>
        <div>
          <dt>Easy pace</dt>
          <dd>{paceWords(trends, units)}</dd>
        </div>
      </dl>

      <WeekBars trends={trends} units={units} />

      {trends.gaps.length > 0 && (
        <details className="insights-gaps">
          <summary>What these trends can’t see · {trends.gaps.length}</summary>
          <ul>
            {trends.gaps.map((gap) => (
              <li key={gap}>{GAPS[gap]}</li>
            ))}
          </ul>
        </details>
      )}

      <section className="insights-history" aria-labelledby="insights-history-head">
        <h3 id="insights-history-head">Coaching history</h3>
        {decisions.length === 0 ? (
          <p className="field-help">Your answers to the weekly review appear here: what was suggested, and whether you accepted or declined it.</p>
        ) : (
          <ul>
            {decisions.map((d) => (
              <li key={`${d.weekStart}|${d.decidedAt}`}>
                <span className={`insights-outcome is-${d.outcome}`}>{d.outcome === 'Accepted' ? 'Accepted' : 'Declined'}</span>{' '}
                Week of {shortDay(d.weekStart)}: {TITLES[d.verdict]}
                {d.changedPlan ? '' : ' (no change to the plan)'} · {shortDay(d.decidedAt.slice(0, 10))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
