import { addDays, formatDate, formatDistance, type Units } from '../../lib/format'
import { daysBetween, progressBetween } from '../../lib/countdown'
import type { Race } from '../../lib/types'

interface Props {
  races: Race[]
  today: string
  units: Units
  /** The line under the headline, which depends on whether accounts are switched on. */
  lede: string
}

const RING = 2 * Math.PI * 88

/** The home page's opening: the headline, and a ring counting down to the next big race. */
export function Hero({ races, today, units, lede }: Props) {
  const next = races.find((r) => daysBetween(today, r.date) >= 0)
  const days = next ? daysBetween(today, next.date) : null
  // The ring closes over the year before race day, so it fills as the race gets closer.
  const filled = next ? progressBetween(addDays(next.date, -365), next.date, today) : 0

  return (
    <div className="intro hero">
      <div className="hero-copy">
        <h1>
          You’ve entered the race. <em>Let’s get you to the start.</em>
        </h1>
        <p>{lede}</p>
      </div>

      {next && days !== null && (
        <div className="countdown" role="group" aria-label={`${days === 0 ? 'Race day' : `${days} days to go`}: ${next.name}`}>
          <div className="countdown-ring">
            <svg viewBox="0 0 220 220" aria-hidden="true">
              <circle cx="110" cy="110" r="88" className="countdown-track" />
              <circle
                cx="110"
                cy="110"
                r="88"
                className="countdown-fill"
                transform="rotate(-90 110 110)"
                style={{ strokeDasharray: RING, ['--ring-offset' as string]: `${RING * (1 - filled)}` }}
              />
            </svg>
            <div className="countdown-number" aria-hidden="true">
              <span className="mono">{days}</span>
              <small className="mono">{days === 1 ? 'DAY TO GO' : days === 0 ? 'RACE DAY' : 'DAYS TO GO'}</small>
            </div>
          </div>
          <div className="countdown-race" aria-hidden="true">
            <strong>{next.name}</strong>
            <span className="mono">
              {formatDate(next.date, 'dayMonth').toUpperCase()} · {formatDistance(next.distanceKm, units).toUpperCase()}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** A volt band of races scrolling past, like a stadium ticker. Decorative: the real list is the first question. */
export function RaceTicker({ races, units }: { races: Race[]; units: Units }) {
  if (races.length === 0) return null
  const items = [...races.map((r) => `${r.name} · ${formatDistance(r.distanceKm, units)}`), 'Your parkrun PB · 5 km']
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track mono">
        {[...items, ...items].map((item, i) => (
          <span key={`${item}-${i}`}>
            {item}
            <i />
          </span>
        ))}
      </div>
    </div>
  )
}
