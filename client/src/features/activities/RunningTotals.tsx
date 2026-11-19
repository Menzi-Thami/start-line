import { useState, type ReactNode } from 'react'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { ActivitySummary } from '../../lib/types'
import { change, trainingTotals, type Change } from '../runner-home/home-math'
import { useAllTime, useRunningLog } from '../runner-home/home-data'

function ChangeLine({ value, units, against }: { value: Change; units: Units; against: string }) {
  if (value.delta === 0) return <p className="home-change">Level with {against}</p>
  const up = value.delta > 0
  return (
    <p className={`home-change ${up ? 'home-change-up' : 'home-change-down'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span> {formatDistance(Math.abs(value.delta), units)}
      {value.percent != null && ` (${Math.abs(value.percent)}%)`} {up ? 'more than' : 'less than'} {against}
    </p>
  )
}

function Tile({ label, value, unit, sub, children }: { label: string; value: string; unit: string; sub: string; children?: ReactNode }) {
  return (
    <div className="home-tile">
      <p className="home-tile-label">{label}</p>
      <p className="home-tile-value">
        <span className="mono">{value}</span> <span className="home-tile-unit">{unit}</span>
      </p>
      <p className="field-help">{sub}</p>
      {children}
    </div>
  )
}

/** A distance's number alone, for a tile that shows its unit apart: "91.3". */
const amount = (km: number, units: Units) => formatDistance(km, units).split(' ')[0]!

/**
 * The running totals above the Runs list: this month, this year, the weekly average and all time. They count saved
 * history and the Strava runs currently available, each run once, without copying Strava measurements into history.
 */
export function RunningTotals({ ownerId, units, today, runs }: { ownerId: string; units: Units; today: string; runs: readonly ActivitySummary[] }) {
  const [version, setVersion] = useState(0)
  const activitiesVersion = runs.map(run => `${run.id}|${run.localDate}|${run.distanceKm}|${run.kind}|${run.source.kind}|${run.source.cachedUntil ?? ''}`).sort().join(';')
  const { log, failed } = useRunningLog(version, activitiesVersion, ownerId)
  const allTime = useAllTime(ownerId)
  if (failed) return (
    <div className="home-data-state" role="alert">
      <p>Your running totals couldn’t load. Try again when you’re ready.</p>
      <button type="button" className="button" onClick={() => setVersion(v => v + 1)}>Retry running totals</button>
    </div>
  )
  if (log === null) return <div className="skeleton-stack" role="status" aria-label="Loading running totals"><span className="skeleton-line skeleton-line-wide" /><span className="skeleton-line" /></div>
  if (log.length === 0) return null
  const totals = trainingTotals(log, today)
  const fromStrava = log.some(run => run.source === 'Strava')
  return (
    <section className="runs-totals" aria-label="Your running totals">
      <div className="home-tiles">
        <Tile label="This month" value={totals.month.km === 0 && totals.month.unknownRuns ? '—' : amount(totals.month.km, units)} unit={units} sub={`${totals.month.runs} ${totals.month.runs === 1 ? 'run' : 'runs'}`}>
          {totals.month.stravaKm != null && <p className="field-help">{formatDistance(totals.month.stravaKm, units)} from Strava</p>}
          {totals.month.unknownRuns || totals.previousMonth.unknownRuns ? <p className="field-help">Comparison unavailable while distances are missing.</p> : <ChangeLine
            value={change(totals.month.km, totals.previousMonth.km)}
            units={units}
            against={`${formatDate(totals.previousMonth.from, 'dayMonth')}–${formatDate(totals.previousMonth.to, 'dayMonth')}`}
          />}
        </Tile>
        <Tile label="This year" value={totals.year.km === 0 && totals.year.unknownRuns ? '—' : amount(totals.year.km, units)} unit={units} sub={`${totals.year.runs} ${totals.year.runs === 1 ? 'run' : 'runs'}`}>
          {totals.year.stravaKm != null && <p className="field-help">{formatDistance(totals.year.stravaKm, units)} from Strava</p>}
        </Tile>
        <Tile label="Weekly average" value={totals.weeklyAverageKm === 0 && totals.weeklyUnknownRuns ? '—' : amount(totals.weeklyAverageKm, units)} unit={units} sub="Last 4 full weeks">
          {totals.weeklyUnknownRuns || totals.previousWeeklyUnknownRuns ? <p className="field-help">Comparison unavailable while distances are missing.</p> : <ChangeLine value={change(totals.weeklyAverageKm, totals.previousWeeklyAverageKm)} units={units} against="the 4 weeks before" />}
        </Tile>
        {allTime && allTime.runs > 0 && (
          <Tile label="All time" value={amount(allTime.km, units)} unit={units} sub={`${allTime.runs} ${allTime.runs === 1 ? 'run' : 'runs'}${allTime.since ? ` since ${formatDate(allTime.since, 'dayMonth')} ${allTime.since.slice(0, 4)}` : ''}`} />
        )}
      </div>
      <details className="home-totals-note"><summary>About your totals</summary><p className="field-help">
        Totals include your saved running history and available Strava runs, counting each run once. The weekly average leaves out this week.
        {totals.month.unknownRuns ? ` ${totals.month.unknownRuns} ${totals.month.unknownRuns === 1 ? 'run has' : 'runs have'} no distance and ${totals.month.unknownRuns === 1 ? 'is' : 'are'} left out of distance totals.` : ''}
        {fromStrava && ' Strava runs count while Taperday holds them (up to 7 days) and drop out when they expire, are deleted or Strava is disconnected. Your own saved distances stay.'}
      </p></details>
    </section>
  )
}
