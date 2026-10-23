import { useId, useState } from 'react'
import { api } from '../../lib/api-client'
import { formatDistance, formatDuration, formatPace, KM_PER_MILE, parseTimeSpan, toKilometres, type Units } from '../../lib/format'
import { DurationInput } from '../builder/controls'
import { durationSeconds, toDuration, type Duration } from '../builder/duration'
import { fuelling, heartRateZones, paceFor, splits, timeFor } from './calculator-math'

type Tool = 'pace' | 'predict' | 'splits' | 'zones' | 'fuel'

const TOOLS: readonly { id: Tool; label: string }[] = [
  { id: 'pace', label: 'Pace' },
  { id: 'predict', label: 'Race times' },
  { id: 'splits', label: 'Splits' },
  { id: 'zones', label: 'Heart rate' },
  { id: 'fuel', label: 'Fuelling' },
]

const RACES = [
  { label: '5K', km: 5 },
  { label: '10K', km: 10 },
  { label: 'Half marathon', km: 21.0975 },
  { label: 'Marathon', km: 42.195 },
] as const

const EMPTY: Duration = { h: '', m: '', s: '' }

interface Props {
  units: Units
  /** The runner's own maximum heart rate, if they've set it, to start the zones from. */
  maxHeartRate?: number | null
  /** Their race and goal, so splits and fuelling open on the race they're training for. */
  race?: { distanceKm: number; goalSeconds: number } | null
}

/** A distance: one of the usual races, or any other in the runner's units. Always held in kilometres. */
function DistancePicker({ label, km, onChange, units }: { label: string; km: number; onChange: (km: number) => void; units: Units }) {
  const id = useId()
  const known = RACES.find((r) => Math.abs(r.km - km) < 1e-6)
  const [custom, setCustom] = useState(known ? '' : String(Math.round((units === 'mi' ? km / KM_PER_MILE : km) * 100) / 100))
  return (
    <div className="calc-row">
      <div className="field">
        <label className="field-label" htmlFor={`${id}-race`}>
          {label}
        </label>
        <select
          id={`${id}-race`}
          className="input"
          value={known ? String(known.km) : 'other'}
          onChange={(e) => {
            if (e.target.value !== 'other') onChange(Number(e.target.value))
            else onChange(toKilometres(Number(custom) || 0, units))
          }}
        >
          {RACES.map((r) => (
            <option key={r.label} value={r.km}>
              {r.label}
            </option>
          ))}
          <option value="other">Another distance</option>
        </select>
      </div>
      {!known && (
        <div className="field">
          <label className="field-label" htmlFor={`${id}-km`}>
            Distance ({units})
          </label>
          <input
            id={`${id}-km`}
            className="input"
            inputMode="decimal"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value)
              onChange(toKilometres(Number(e.target.value) || 0, units))
            }}
          />
        </div>
      )}
    </div>
  )
}

function PaceTool({ units }: { units: Units }) {
  const [km, setKm] = useState(10)
  const [time, setTime] = useState<Duration>(EMPTY)
  const seconds = durationSeconds(time)
  const pace = km > 0 && seconds > 0 ? paceFor(km, seconds) : null
  const [paceInput, setPaceInput] = useState<Duration>(EMPTY)
  const perUnit = durationSeconds(paceInput)
  const finish = km > 0 && perUnit > 0 ? timeFor(km, units === 'mi' ? perUnit / KM_PER_MILE : perUnit) : null

  return (
    <div className="calc-tool">
      <DistancePicker label="Distance" km={km} onChange={setKm} units={units} />
      <div className="calc-pair">
        <div>
          <DurationInput legend="Your time" value={time} onChange={setTime} />
          <p className="calc-answer" aria-live="polite">
            {pace ? (
              <>
                That’s <strong className="mono">{formatPace(pace, units)}</strong>, or{' '}
                <span className="mono">{(3600 / (units === 'mi' ? pace * KM_PER_MILE : pace)).toFixed(1)}</span> {units === 'mi' ? 'mph' : 'km/h'}.
              </>
            ) : (
              'Enter a time to see the pace.'
            )}
          </p>
        </div>
        <div>
          <DurationInput legend={`Or a pace (per ${units})`} value={paceInput} onChange={setPaceInput} />
          <p className="calc-answer" aria-live="polite">
            {finish ? (
              <>
                You’d finish in <strong className="mono">{formatDuration(finish)}</strong>.
              </>
            ) : (
              'Enter a pace to see the finish time.'
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

type Predictions = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; rows: { label: string; seconds: number; pace: number }[] } | { kind: 'error'; message: string }

function PredictTool({ units }: { units: Units }) {
  const [km, setKm] = useState(5)
  const [time, setTime] = useState<Duration>(EMPTY)
  const [state, setState] = useState<Predictions>({ kind: 'idle' })
  const seconds = durationSeconds(time)

  const predict = async () => {
    setState({ kind: 'busy' })
    try {
      const results = await Promise.all(RACES.map((r) => api.predict(km, seconds, r.km)))
      setState({
        kind: 'done',
        rows: results.map((p, i) => ({ label: RACES[i]!.label, seconds: parseTimeSpan(p.predictedTime) ?? 0, pace: p.paceSecondsPerKm })),
      })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'That didn’t work. Try again.' })
    }
  }

  return (
    <div className="calc-tool">
      <p className="field-help">From a recent race or all-out time trial, what the same fitness could run over other distances.</p>
      <DistancePicker label="Your recent race" km={km} onChange={setKm} units={units} />
      <DurationInput legend="Your time" value={time} onChange={setTime} />
      <button type="button" className="button" disabled={seconds <= 0 || km <= 0 || state.kind === 'busy'} onClick={() => void predict()}>
        {state.kind === 'busy' ? 'Working it out…' : 'Predict my race times'}
      </button>
      <div aria-live="polite">
        {state.kind === 'error' && <p className="field-error">{state.message}</p>}
        {state.kind === 'done' && (
          <table className="calc-table">
            <thead>
              <tr>
                <th scope="col">Race</th>
                <th scope="col">Time</th>
                <th scope="col">Pace</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className="mono">{formatDuration(row.seconds)}</td>
                  <td className="mono">{formatPace(row.pace, units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {state.kind === 'done' && <p className="field-help">Longer races assume the training for them: a 5K time alone won’t carry you through a marathon.</p>}
    </div>
  )
}

function SplitsTool({ units, race }: Pick<Props, 'units' | 'race'>) {
  const [km, setKm] = useState(race?.distanceKm ?? 10)
  const [time, setTime] = useState<Duration>(race ? toDuration(race.goalSeconds) : EMPTY)
  const [negative, setNegative] = useState(false)
  const id = useId()
  const rows = splits(km, durationSeconds(time), units, negative)

  return (
    <div className="calc-tool">
      <DistancePicker label="Race" km={km} onChange={setKm} units={units} />
      <DurationInput legend="Goal time" value={time} onChange={setTime} />
      <label className="calc-check" htmlFor={`${id}-negative`}>
        <input id={`${id}-negative`} type="checkbox" checked={negative} onChange={(e) => setNegative(e.target.checked)} /> Negative split: start 1% easier,
        finish 1% quicker
      </label>
      {rows.length > 0 && (
        <div className="calc-scroll">
          <table className="calc-table">
            <thead>
              <tr>
                <th scope="col">{units === 'mi' ? 'Mile' : 'Km'}</th>
                <th scope="col">Split</th>
                <th scope="col">Elapsed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <th scope="row">{row.label}</th>
                  <td className="mono">{formatDuration(row.splitSeconds)}</td>
                  <td className="mono">{formatDuration(row.elapsedSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ZonesTool({ maxHeartRate }: Pick<Props, 'maxHeartRate'>) {
  const id = useId()
  const [max, setMax] = useState(maxHeartRate ? String(maxHeartRate) : '')
  const value = Number(max)
  const zones = value >= 120 && value <= 230 ? heartRateZones(value) : []

  return (
    <div className="calc-tool">
      <div className="field">
        <label className="field-label" htmlFor={`${id}-max`}>
          Your maximum heart rate (bpm)
        </label>
        <input id={`${id}-max`} className="input calc-short" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} />
        <p className="field-help">Don’t know it? The highest number your watch has shown on a hard hill is a better guide than any formula.</p>
      </div>
      {zones.length > 0 && (
        <ol className="calc-zones">
          {zones.map((z) => (
            <li key={z.zone} className={`calc-zone calc-zone-${z.zone}`}>
              <span className="calc-zone-name">
                Zone {z.zone}: {z.name}
              </span>
              <span className="mono">
                {z.low}–{z.high} bpm
              </span>
              <span className="field-help">{z.feel}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function FuelTool({ race }: Pick<Props, 'race'>) {
  const [time, setTime] = useState<Duration>(race ? toDuration(race.goalSeconds) : EMPTY)
  const seconds = durationSeconds(time)
  const fuel = seconds > 0 ? fuelling(seconds) : null

  return (
    <div className="calc-tool">
      <DurationInput legend="How long you expect to be out there" value={time} onChange={setTime} />
      <div aria-live="polite">
        {fuel && (
          <div className="calc-fuel">
            {fuel.perHour && fuel.total && fuel.gels ? (
              <p>
                Aim for <strong className="mono">{fuel.perHour[0]}–{fuel.perHour[1]} g</strong> of carbohydrate an hour: about{' '}
                <span className="mono">
                  {fuel.total[0]}–{fuel.total[1]} g
                </span>{' '}
                in all, or{' '}
                <span className="mono">
                  {fuel.gels[0]}–{fuel.gels[1]}
                </span>{' '}
                gels.
              </p>
            ) : null}
            <p>{fuel.advice}</p>
            <p className="field-help">Try race-day fuel on your long runs first. Your own gut has the final say.</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** The runner's toolkit: pace, race times, splits, heart-rate zones and race fuelling, one at a time. */
export function Calculators({ units, maxHeartRate, race }: Props) {
  const [tool, setTool] = useState<Tool>('pace')
  return (
    <section className="section home-section" aria-labelledby="home-calculators">
      <h2 id="home-calculators" className="home-heading">
        Calculators
      </h2>
      <div className="calc-tools" role="group" aria-label="Choose a calculator">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className="calc-chip" aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel calc-panel">
        {tool === 'pace' && <PaceTool units={units} />}
        {tool === 'predict' && <PredictTool units={units} />}
        {tool === 'splits' && <SplitsTool units={units} race={race} />}
        {tool === 'zones' && <ZonesTool maxHeartRate={maxHeartRate} />}
        {tool === 'fuel' && <FuelTool race={race} />}
      </div>
      {race && (
        <p className="field-help">
          Splits and fuelling start from your race: {formatDistance(race.distanceKm, units)} in {formatDuration(race.goalSeconds)}.
        </p>
      )}
    </section>
  )
}
