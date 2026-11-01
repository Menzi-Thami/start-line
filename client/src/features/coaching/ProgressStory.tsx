import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDistance, formatDuration, formatPace, formatShortDay as shortDay, parseTimeSpan, type Units } from '../../lib/format'
import type { ProgressGap, ProgressStory as Story, ProgressStoryResult } from '../../lib/types'

type Span = 4 | 8 | 12
type State = { kind: 'loading' } | { kind: 'ready'; data: Story } | { kind: 'error'; message: string }

interface Props {
  planId: string
  units: Units
  /** Changes when a check-in or run changes, so the story follows. */
  refreshKey?: string | number
}

const SPANS: readonly Span[] = [4, 8, 12]

function isStory(value: unknown): value is Story {
  const data = value as Partial<Story> | null
  const story = data?.story as Partial<ProgressStoryResult> | undefined
  return typeof data === 'object' && data !== null && !Array.isArray(data) && typeof story === 'object' && story !== null
    && Array.isArray(story.weekRows) && typeof story.current === 'object' && typeof story.previous === 'object'
    && Array.isArray(story.bests) && Array.isArray(story.gaps) && typeof story.adherence === 'object' && typeof story.easyPace === 'object'
}

const GAPS: Record<ProgressGap, string> = {
  FewWeeks: 'Fewer than two weeks in this span have runs, so the story is short so far.',
  NoBaseline: 'Nothing was logged in the span before, so there is nothing to compare with yet.',
  MissingDistances: 'Some runs were ticked without a distance: they count as runs, not kilometres.',
  StravaWindow: 'Strava runs count for the 7 days Taperday may keep them, so older weeks show uploads and check-ins only. Upload a file to keep a run for good.',
  NoRaceEstimate: 'No race estimate yet: it needs an uploaded run with a best effort of 3 km or more in the last six weeks.',
  NoPlan: 'This plan can no longer be built, so planned distances and the race goal are missing.',
}

/** "+12%", "−3%" or "same": how a figure moved against the span before. */
function change(now: number, before: number): string {
  if (before <= 0) return now > 0 ? 'new' : '—'
  const percent = Math.round(((now - before) / before) * 100)
  return percent === 0 ? 'same' : `${percent > 0 ? '+' : '−'}${Math.abs(percent)}%`
}

function Comparison({ story, units }: { story: ProgressStoryResult; units: Units }) {
  const { current: now, previous: before, weeks } = story
  const rows = [
    { name: 'Distance', now: formatDistance(now.km, units), before: formatDistance(before.km, units), move: change(now.km, before.km) },
    { name: 'Runs', now: String(now.runs), before: String(before.runs), move: change(now.runs, before.runs) },
    { name: 'Average week', now: formatDistance(now.averageWeeklyKm, units), before: formatDistance(before.averageWeeklyKm, units), move: change(now.averageWeeklyKm, before.averageWeeklyKm) },
    { name: 'Longest run', now: formatDistance(now.longestKm, units), before: formatDistance(before.longestKm, units), move: change(now.longestKm, before.longestKm) },
    { name: 'Weeks with running', now: `${now.weeksRun} of ${weeks}`, before: `${before.weeksRun} of ${weeks}`, move: change(now.weeksRun, before.weeksRun) },
  ]
  return (
    <table className="progress-compare">
      <caption className="visually-hidden">The last {weeks} weeks against the {weeks} weeks before</caption>
      <thead>
        <tr>
          <th scope="col"><span className="visually-hidden">Measure</span></th>
          <th scope="col">Last {weeks} weeks</th>
          <th scope="col">{weeks} before</th>
          <th scope="col">Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <th scope="row">{row.name}</th>
            <td className="mono">{row.now}</td>
            <td className="mono">{row.before}</td>
            <td className="mono">{row.move}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Each week as a bar (run, solid) over the plan (outline), with the longest run marked; a table says the same. */
function WeekBars({ story, units }: { story: ProgressStoryResult; units: Units }) {
  const max = Math.max(1, ...story.weekRows.map((w) => Math.max(w.ranKm, w.plannedKm)))
  return (
    <figure className="progress-weeks">
      <div className="progress-bars" style={{ gridTemplateColumns: `repeat(${story.weekRows.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {story.weekRows.map((week) => (
          <span key={week.weekStart} className={week.isCurrent ? 'insights-bar is-current' : 'insights-bar'}>
            <span className="insights-bar-planned" style={{ blockSize: `${(week.plannedKm / max) * 100}%` }} />
            <span className="insights-bar-ran" style={{ blockSize: `${(week.ranKm / max) * 100}%` }} />
            {week.longestKm > 0 && <span className="progress-longest" style={{ insetBlockEnd: `${(week.longestKm / max) * 100}%` }} />}
          </span>
        ))}
      </div>
      <figcaption className="field-help">Each week: run (solid) against planned (outline); the line marks the longest run. This week counts up to today.</figcaption>
      <div className="visually-hidden">
        <table>
          <caption>Distance by week, last {story.weeks} weeks</caption>
          <thead>
            <tr>
              <th scope="col">Week of</th>
              <th scope="col">Run</th>
              <th scope="col">Planned</th>
              <th scope="col">Longest run</th>
            </tr>
          </thead>
          <tbody>
            {story.weekRows.map((week) => (
              <tr key={week.weekStart}>
                <th scope="row">{shortDay(week.weekStart)}{week.isCurrent ? ' (so far)' : ''}</th>
                <td>{formatDistance(week.ranKm, units)}</td>
                <td>{formatDistance(week.plannedKm, units)}</td>
                <td>{formatDistance(week.longestKm, units)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

function seconds(value: string | null | undefined): number | null {
  return value ? parseTimeSpan(value) : null
}

/** The race goal against what uploaded runs point to, first and latest in the span, with the weekly estimates as a table. */
function RaceGoal({ story, units }: { story: ProgressStoryResult; units: Units }) {
  const goal = story.raceGoal
  if (!goal) return null
  const target = seconds(goal.goal)
  const latest = seconds(goal.latest)
  const first = seconds(goal.first)
  const raceName = formatDistance(goal.raceKm, units)
  let verdict = `Your goal for the ${raceName} race on ${shortDay(goal.raceDate)} is ${target != null ? formatDuration(target) : goal.goal}.`
  if (latest != null && target != null) {
    const gap = latest - target
    const off = Math.abs(gap) < 60 ? `${Math.abs(gap)}s` : formatDuration(Math.abs(gap))
    verdict += ` Your uploaded runs point to ${formatDuration(latest)}: ${Math.abs(gap) < 15 ? 'right on your goal' : `${off} ${gap > 0 ? 'slower than' : 'faster than'} your goal`}.`
    if (first != null && first !== latest) verdict += ` At the start of this span they pointed to ${formatDuration(first)}.`
  }
  return (
    <div className="progress-goal">
      <h3>Race goal</h3>
      <p>{verdict}</p>
      {goal.estimates.length > 0 && (
        <div className="visually-hidden">
          <table>
            <caption>Race estimate by week</caption>
            <thead>
              <tr>
                <th scope="col">Week of</th>
                <th scope="col">Estimate</th>
              </tr>
            </thead>
            <tbody>
              {goal.estimates.map((e) => (
                <tr key={e.weekStart}>
                  <th scope="row">{shortDay(e.weekStart)}</th>
                  <td>{formatDuration(seconds(e.time) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * The progress story for the plan on screen: the last 4, 8 or 12 weeks against the same span before. Distance,
 * consistency and long runs, easy pace at the same effort, bests set in the span and the race goal, each with what it
 * can't see. Worked out on the server on every read; nothing about Strava runs is kept.
 */
export function ProgressStory({ planId, units, refreshKey }: Props) {
  const auth = useAuth()
  const [span, setSpan] = useState<Span>(4)
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.progressStory(token, planId, span) : Promise.reject(new Error('Sign in to see your progress.'))))
      .then((data) => {
        if (!isStory(data)) throw new Error('Your progress isn’t available right now.')
        if (!cancelled) setState({ kind: 'ready', data })
      })
      .catch((error: unknown) => !cancelled && setState({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' }))
    return () => {
      cancelled = true
    }
  }, [auth, planId, span, refreshKey])

  return (
    <div className="progress">
      <div className="progress-spans" role="group" aria-label="Span">
        {SPANS.map((weeks) => (
          <button key={weeks} type="button" className="progress-span" aria-pressed={span === weeks} onClick={() => { if (weeks !== span) { setSpan(weeks); setState({ kind: 'loading' }) } }}>
            {weeks} weeks
          </button>
        ))}
      </div>
      {state.kind === 'loading' && <p className="field-help">Working out your progress…</p>}
      {state.kind === 'error' && <p className="field-help">{state.message}</p>}
      {state.kind === 'ready' && <StoryBody story={state.data.story} units={units} />}
    </div>
  )
}

function StoryBody({ story, units }: { story: ProgressStoryResult; units: Units }) {
  const { adherence, easyPace: pace } = story
  return (
    <>
      <Comparison story={story} units={units} />
      <WeekBars story={story} units={units} />
      <dl className="insights-facts">
        <div>
          <dt>Consistency</dt>
          <dd>
            {adherence.planned === 0
              ? `No planned sessions in the last ${story.weeks} weeks yet.`
              : `${adherence.done} of ${adherence.planned} planned sessions run (${Math.round((adherence.share ?? 0) * 100)}%) · ${adherence.skipped} skipped · ${adherence.unlogged} not logged.`}
          </dd>
        </div>
        <div>
          <dt>Easy pace</dt>
          <dd>
            {pace.recentSecondsPerKm != null && pace.earlierSecondsPerKm != null && pace.changeSecondsPerKm != null
              ? `${formatPace(pace.recentSecondsPerKm, units)} at the same easy effort, from ${formatPace(pace.earlierSecondsPerKm, units)} in the ${story.weeks} weeks before${Math.abs(pace.changeSecondsPerKm) < 3 ? ': about the same' : pace.changeSecondsPerKm < 0 ? `: ${Math.abs(pace.changeSecondsPerKm)}s/km faster` : `: ${pace.changeSecondsPerKm}s/km slower`}.`
              : `Not enough easy runs to compare (${pace.recentRuns} now, ${pace.earlierRuns} before; two of 2 km or more needed in each).`}
          </dd>
        </div>
      </dl>
      <div className="progress-bests">
        <h3>Bests in these weeks</h3>
        {story.bests.length === 0 ? (
          <p className="field-help">No timed efforts over 1K or more in these weeks. Runs with GPS add them.</p>
        ) : (
          <ul>
            {story.bests.map((best) => {
              const time = seconds(best.time)
              const before = seconds(best.before)
              return (
                <li key={best.distanceMetres}>
                  <strong>{best.name}</strong> <span className="mono">{time != null ? formatDuration(time) : best.time}</span> · {shortDay(best.date)}
                  {best.isNew ? (
                    <span className="progress-new"> · {before != null ? `new best, from ${formatDuration(before)}` : 'first one recorded'}</span>
                  ) : (
                    before != null && <span className="field-help"> · best is {formatDuration(before)}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <RaceGoal story={story} units={units} />
      {story.gaps.length > 0 && (
        <details className="insights-gaps">
          <summary>What this story can’t see · {story.gaps.length}</summary>
          <ul>
            {story.gaps.map((gap) => (
              <li key={gap}>{GAPS[gap]}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
