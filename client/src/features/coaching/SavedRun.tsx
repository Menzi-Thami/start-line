import { formatDate } from '../../lib/format'
import type { ActivitySummary, CheckIn } from '../../lib/types'
import { AdditionalRun } from './AdditionalRun'
import { CheckInCard } from './CheckInCard'
import { runTypeName } from './run-types'
import type { SessionCoach } from './useCheckIns'

export function SavedRun({ entry, coach, runs = [], showDate = false, onOpenRun }: {
  entry: CheckIn; coach: SessionCoach; runs?: readonly ActivitySummary[]; showDate?: boolean; onOpenRun?: (id: string) => void
}) {
  if (entry.isAdditional) return <AdditionalRun entry={entry} coach={coach} runs={runs} showDate={showDate} onOpenRun={onOpenRun} />
  return <article className="additional-run" aria-label={`Logged run on ${formatDate(entry.date, 'long')}`}>
    {showDate && <p className="field-help">{formatDate(entry.date, 'long')}</p>}
    <p className="wait-tip-label">{runTypeName(entry.actualSessionType ?? entry.sessionType)}</p>
    <CheckInCard session={{ date: entry.date, type: entry.sessionType, title: 'Logged run', distanceKm: entry.prescribedKm ?? 0, zone: null, detail: '', purpose: '', exercises: [], steps: [] }} coach={{ ...coach, get: () => entry }} runs={runs} />
    {onOpenRun && entry.activityId && runs.some(run => run.id === entry.activityId) && <button type="button" className="link-button" onClick={() => onOpenRun(entry.activityId!)}>View imported run</button>}
  </article>
}
