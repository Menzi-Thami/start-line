import { formatDate } from '../../lib/format'
import type { ActivitySummary, CheckIn } from '../../lib/types'
import { CheckInCard } from './CheckInCard'
import { RunResult } from './RunResult'
import type { SessionCoach } from './useCheckIns'

/** A saved run stays visible independently of its imported activity and the prescribed sessions. */
export function AdditionalRun({ entry, coach, runs = [], showDate = false, onOpenRun }: {
  entry: CheckIn
  coach: SessionCoach
  runs?: readonly ActivitySummary[]
  showDate?: boolean
  onOpenRun?: (id: string) => void
}) {
  return (
    <article className="additional-run" aria-label={`Additional run on ${formatDate(entry.date, 'long')}`}>
      {showDate && <p className="field-help">{formatDate(entry.date, 'long')}</p>}
      {coach.saveAdditional && coach.removeAdditional ? (
        <CheckInCard
          session={{ date: entry.date, type: entry.sessionType, title: 'Additional run', distanceKm: 0, zone: null, detail: '', purpose: '', exercises: [], steps: [] }}
          coach={{ ...coach, get: () => entry, save: (session, answers) => coach.saveAdditional!(entry.id!, session, answers), remove: () => coach.removeAdditional!(entry.id!) }}
          additional
          runs={runs}
        />
      ) : <RunResult entry={entry} runs={runs} units={coach.units} />}
      {onOpenRun && entry.activityId && runs.some(run => run.id === entry.activityId) && <button type="button" className="link-button" onClick={() => onOpenRun(entry.activityId!)}>View imported run</button>}
    </article>
  )
}
