import type { ActivitySummary } from '../../lib/types'
import { consistencyNarrative, consistencyWeeks } from '../progress-story/consistency'

export function ProgressStory({ runs, today }: { runs: ActivitySummary[]; today: string }) {
  const { current, previous } = consistencyWeeks(runs, today)
  if (!current.runs && !previous.runs) return null
  return <details className="disclosure">
    <summary>Your running consistency</summary>
    <p><strong>{current.days} active {current.days === 1 ? 'day' : 'days'}</strong> from {current.runs} recorded runs over the last seven days.</p>
    <p>{consistencyNarrative(current, previous)}</p>
    <p className="field-help">Compares consecutive rolling seven-day windows using available records. The current period can be incomplete and synced records can expire. This is not a fitness score.</p>
  </details>
}
