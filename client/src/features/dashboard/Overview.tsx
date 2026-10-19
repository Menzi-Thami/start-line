import { formatDate, formatDistance, formatDuration, formatPace, type Units } from '../../lib/format'
import { runsByDate, ranKmByWeek } from '../../lib/plan-runs'
import type { ActivitySummary, PersonalBest, PlanWeek, StravaStatus, TrainingPlan } from '../../lib/types'
import { KIND_LABEL } from '../activities/activity-copy'
import { VolumeChart } from '../plan/VolumeChart'
import { adherence, easyTrend, missedKeySession, verdictChip, weekSoFar, type TrendPoint } from './dashboard-math'
import { PoweredByStrava, ViewOnStrava } from '../sync/StravaBrand'

interface Props {
  plan: TrainingPlan
  units: Units
  today: string
  currentWeek: number | null
  week: PlanWeek | null
  runs: ActivitySummary[]
  bests?: PersonalBest[]
  strava?: StravaStatus
  onOpenRun?: (id: string) => void
  onOpenAccount?: () => void
  onOpenRuns?: () => void
}

/** The distances worth a line on the overview; the run page lists the rest. */
const HEADLINE_BESTS = [1000, 1609.344, 5000, 10000, 21097.5, 42195]

function SyncLine({ strava, runs, onOpenAccount, onOpenRuns }: Pick<Props, 'strava' | 'onOpenAccount' | 'onOpenRuns'> & { runs: ActivitySummary[] }) {
  if (strava?.connected && strava.status === 'NeedsReconnect') {
    return (
      <div className="callout" role="note">
        Strava has stopped sending your runs, usually because access was removed there.{' '}
        {onOpenAccount && (
          <button type="button" className="link-button" onClick={onOpenAccount}>
            Connect again
          </button>
        )}
      </div>
    )
  }

  if (strava?.connected) {
    const fromStrava = runs.some((r) => r.source.kind === 'Strava')
    return (
      <p className="overview-sync" aria-live="polite">
        <span className="overview-sync-text">
          <span className="overview-sync-dot" aria-hidden="true" />
          {strava.pending > 0
            ? `Fetching ${strava.pending === 1 ? 'a run' : `${strava.pending} runs`} from Strava…`
            : strava.lastSyncedAt
              ? `Runs arrive from Strava by themselves. Last one ${formatDate(strava.lastSyncedAt.slice(0, 10))}.`
              : 'Connected to Strava. New runs appear here once you save them there.'}
        </span>
        {fromStrava && <PoweredByStrava />}
      </p>
    )
  }

  return (
    <p className="overview-sync">
      {strava?.available ? 'Want runs to appear by themselves? ' : 'Add a run from your watch to see it here. '}
      {strava?.available && onOpenAccount && (
        <button type="button" className="link-button" onClick={onOpenAccount}>
          Connect Strava
        </button>
      )}
      {strava?.available && onOpenRuns && ' or '}
      {onOpenRuns && (
        <button type="button" className="link-button" onClick={onOpenRuns}>
          upload a .fit file
        </button>
      )}
    </p>
  )
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const fraction = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div className="meter" role="img" aria-label={label}>
      <span className="meter-fill" style={{ width: `${fraction * 100}%` }} />
    </div>
  )
}

/** One measure over the weeks, one line, no legend: the heading names it. Each point has a hover title. */
function Sparkline({ points, value, format, label }: { points: TrendPoint[]; value: (p: TrendPoint) => number | null; format: (v: number) => string; label: string }) {
  const values = points.map(value)
  const known = values.filter((v): v is number => v != null)
  if (known.length < 2) return null
  const width = 240
  const height = 56
  const pad = 6
  const min = Math.min(...known)
  const max = Math.max(...known)
  const span = max - min || 1
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (width - pad * 2)
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2)
  const path = values
    .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ')

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
      <polyline points={path} fill="none" className="sparkline-line" />
      {values.map((v, i) =>
        v == null ? null : (
          <circle key={points[i]!.weekStart} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 4 : 2.5} className="sparkline-dot">
            <title>{`Week of ${formatDate(points[i]!.weekStart)}: ${format(v)}`}</title>
          </circle>
        ),
      )}
    </svg>
  )
}

function trendSentence(trend: ReturnType<typeof easyTrend>, units: Units): string {
  const { paceChange, heartRateChange, points } = trend
  if (paceChange == null) return 'A few more weeks of easy runs and the trend shows here.'
  const weeks = Math.round((Date.parse(points.at(-1)!.weekStart) - Date.parse(points[0]!.weekStart)) / (7 * 86_400_000))
  const seconds = Math.abs(Math.round(units === 'mi' ? paceChange * 1.609344 : paceChange))
  const pace = seconds < 3 ? 'about the same as' : `${seconds} s/${units} ${paceChange < 0 ? 'quicker than' : 'slower than'}`
  const heart =
    heartRateChange == null ? '' : Math.abs(heartRateChange) < 2 ? ', at a similar heart rate' : `, with heart rate ${Math.abs(heartRateChange)} bpm ${heartRateChange < 0 ? 'lower' : 'higher'}`
  return `Your easy pace is ${pace} ${weeks} weeks ago${heart}. Heat, hills and sleep move these numbers too.`
}

/**
 * The plan at a glance, from what was actually run: this week, how the plan is going, recent runs and their verdicts,
 * the easy-run trend, weekly distance and personal bests. Built on the runs the plan view already has, so a synced
 * run appears here the moment the list refreshes.
 */
export function Overview({ plan, units, today, currentWeek, week, runs, bests, strava, onOpenRun, onOpenAccount, onOpenRuns }: Props) {
  const byDate = runsByDate(runs)
  const soFar = week ? weekSoFar(week, runs, byDate) : null
  const kept = adherence(plan, byDate, today)
  const missed = missedKeySession(plan, byDate, today)
  const trend = easyTrend(runs, today)
  const ran = ranKmByWeek(plan.weeks, runs, today)
  const recent = [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 5)
  const headline = (bests ?? []).filter((b) => HEADLINE_BESTS.some((d) => Math.abs(d - b.distanceMetres) < 0.5))

  return (
    <div className="overview">
      <SyncLine strava={strava} runs={runs} onOpenAccount={onOpenAccount} onOpenRuns={onOpenRuns} />

      {missed && (
        <div className="callout overview-nudge" role="note">
          <p>
            <strong>{formatDate(missed.date, 'long')}</strong>: no run for {missed.title.toLowerCase()}. No need to make it up: carry on with the
            plan from today.
          </p>
        </div>
      )}

      <div className="overview-grid">
        {soFar && (
          <section className="panel overview-card" aria-labelledby="overview-week">
            <h3 id="overview-week">{currentWeek ? `Week ${currentWeek}` : 'This week'}</h3>
            <p className="overview-figure">
              <span className="mono">{soFar.doneRuns}</span> of {soFar.plannedRuns} runs
            </p>
            <Meter value={soFar.doneRuns} max={soFar.plannedRuns} label={`${soFar.doneRuns} of ${soFar.plannedRuns} planned runs done`} />
            <p className="overview-figure">
              <span className="mono">{formatDistance(soFar.ranKm, units)}</span> of {formatDistance(soFar.plannedKm, units)}
            </p>
            <Meter value={soFar.ranKm} max={soFar.plannedKm} label={`${formatDistance(soFar.ranKm, units)} of ${formatDistance(soFar.plannedKm, units)} run`} />
          </section>
        )}

        <section className="panel overview-card" aria-labelledby="overview-adherence">
          <h3 id="overview-adherence">The plan so far</h3>
          {kept.percent == null ? (
            <p>Your first planned run hasn’t come round yet.</p>
          ) : (
            <>
              <p className="overview-figure">
                <span className="mono">{kept.percent}%</span> of planned runs
              </p>
              <p className="field-help">
                {kept.done} of the {kept.due} runs so far. A missed day here and there is normal; it’s the weeks that add up.
              </p>
            </>
          )}
        </section>
      </div>

      <section className="section overview-section" aria-labelledby="overview-recent">
        <h3 id="overview-recent">Recent runs</h3>
        {recent.length === 0 ? (
          <p className="field-help">No runs yet. They show here with how each one went against the plan.</p>
        ) : (
          <ul className="overview-runs">
            {recent.map((run) => {
              const chip = verdictChip(run)
              return (
                <li className="overview-run" key={run.id}>
                  <div className="overview-run-main">
                    {onOpenRun ? (
                      <button type="button" className="link-button overview-run-title" onClick={() => onOpenRun(run.id)}>
                        {run.plannedTitle ?? KIND_LABEL[run.kind]}
                      </button>
                    ) : (
                      <span className="overview-run-title">{run.plannedTitle ?? KIND_LABEL[run.kind]}</span>
                    )}
                    <span className="week-meta mono">
                      {formatDate(run.localDate)} · {formatDistance(run.distanceKm, units)} · {formatPace(run.paceSecondsPerKm, units)}
                    </span>
                  </div>
                  <span className={`chip chip-${chip.tone}`}>{chip.label}</span>
                  {run.source.viewUrl && <ViewOnStrava href={run.source.viewUrl} />}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section overview-section" aria-labelledby="overview-trend">
        <h3 id="overview-trend">Easy runs over time</h3>
        <p className="field-help">{trendSentence(trend, units)}</p>
        {trend.points.length >= 2 && (
          <div className="overview-trend">
            <figure>
              <figcaption>Easy pace, weekly median</figcaption>
              <Sparkline
                points={trend.points}
                value={(p) => -p.paceSecondsPerKm}
                format={(v) => formatPace(-v, units)}
                label={`Easy pace by week, from ${formatPace(trend.points[0]!.paceSecondsPerKm, units)} to ${formatPace(trend.points.at(-1)!.paceSecondsPerKm, units)}`}
              />
            </figure>
            {trend.points.some((p) => p.heartRate != null) && (
              <figure>
                <figcaption>Heart rate on easy runs</figcaption>
                <Sparkline points={trend.points} value={(p) => p.heartRate} format={(v) => `${v} bpm`} label="Average heart rate on easy runs by week" />
              </figure>
            )}
            <table className="visually-hidden">
              <caption>Easy runs by week</caption>
              <thead>
                <tr>
                  <th scope="col">Week of</th>
                  <th scope="col">Median pace</th>
                  <th scope="col">Heart rate</th>
                  <th scope="col">Runs</th>
                </tr>
              </thead>
              <tbody>
                {trend.points.map((p) => (
                  <tr key={p.weekStart}>
                    <td>{formatDate(p.weekStart)}</td>
                    <td>{formatPace(p.paceSecondsPerKm, units)}</td>
                    <td>{p.heartRate == null ? '–' : `${p.heartRate} bpm`}</td>
                    <td>{p.runs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section overview-section" aria-labelledby="overview-volume">
        <h3 id="overview-volume">Weekly distance, ran against planned</h3>
        <VolumeChart weeks={plan.weeks} units={units} currentWeek={currentWeek} ran={ran} />
      </section>

      <section className="section overview-section" aria-labelledby="overview-bests">
        <h3 id="overview-bests">Personal bests</h3>
        {headline.length === 0 ? (
          <p className="field-help">Your fastest 1K, mile, 5K and up show here, from any run, race or not.</p>
        ) : (
          <ul className="overview-bests">
            {headline.map((best) => (
              <li key={best.distanceMetres}>
                <span className="overview-best-name">{best.name}</span>
                <span className="mono">{formatDuration(best.seconds)}</span>
                {onOpenRun ? (
                  <button type="button" className="link-button week-meta" onClick={() => onOpenRun(best.activityId)}>
                    {formatDate(best.localDate)}
                  </button>
                ) : (
                  <span className="week-meta">{formatDate(best.localDate)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
