import { useState, type CSSProperties } from 'react'

const STRIP = '01234567890123456789'.split('')

interface Props {
  name: string
  /** Stamped once the privacy notice is accepted. */
  official: boolean
}

/**
 * The runner's race bib, printed as they sign up: the name they type appears on it live, the number rolls in like a
 * slot machine, and accepting the privacy notice stamps it OFFICIAL. Decoration only; the form carries the meaning.
 */
export function RaceBib({ name, official }: Props) {
  const [number] = useState(() => String(Math.floor(Math.random() * 9000) + 1000))

  return (
    <div className="entry-bib" aria-hidden="true">
      <span className="entry-bib-pin entry-bib-pin-left" />
      <span className="entry-bib-pin entry-bib-pin-right" />
      <span className="entry-bib-brand mono">Taperday · start list</span>
      <span className="entry-bib-number mono">
        {number.split('').map((digit, i) => (
          <span key={i} className="reel" style={{ '--d': digit, '--i': i } as CSSProperties}>
            <span className="reel-strip">
              {STRIP.map((d, j) => (
                <span key={j}>{d}</span>
              ))}
            </span>
          </span>
        ))}
      </span>
      <span className="entry-bib-name">{name.trim() || 'Your name here'}</span>
      {official && <span className="entry-bib-stamp mono">Official</span>}
    </div>
  )
}
