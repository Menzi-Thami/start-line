import { useMemo } from 'react'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import { AchievementShare } from './AchievementShare'
import { formatClock } from './journey-model'
import type { CardContent } from './share-card'
import type { RaceResult } from './types'

export function RaceFinishShare({ raceName, result, units }: { raceName: string; result: RaceResult; units: Units }) {
  const clock = formatClock(result.finishTime)
  const card = useMemo<CardContent>(() => ({
    kicker: 'TAPERDAY · RACE FINISH', heading: 'RACE FINISHED', raceName,
    stats: [
      ...(clock ? [{ value: clock, label: result.timeKind === 'OfficialChip' ? 'Official chip time' : result.timeKind === 'RecordedElapsed' ? 'Recording elapsed time' : 'Finish time' }] : []),
      ...(result.distanceKm != null ? [{ value: formatDistance(result.distanceKm, units), label: result.timeKind === 'RecordedElapsed' ? 'Recorded distance' : 'Distance' }] : []),
      { value: formatDate(result.raceDate, 'dayMonth'), label: result.raceDate.slice(0, 4) },
    ],
    footer: 'EVERY FINISH IS A BEGINNING  ·  taperday.run',
  }), [clock, raceName, result.distanceKm, result.raceDate, result.timeKind, units])
  return <AchievementShare kind="race" card={card} text={`I finished ${raceName}${clock ? ` in ${clock}${result.timeKind === 'RecordedElapsed' ? ' (recording elapsed time)' : ''}` : ''}! #Taperday`} fileName="taperday-race-finish" />
}
