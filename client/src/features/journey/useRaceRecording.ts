import { useEffect, useEffectEvent, useState } from 'react'
import type { Activity, ActivitySummary } from '../../lib/types'
import { verifyRaceRecording } from './race-match'
import type { PlanChapter } from './types'

type Preview = { key: string; activity?: Activity; error?: string }

/** Read the likely recording automatically. Nothing is saved or awarded by loading this preview. */
export function useRaceRecording(
  chapter: Pick<PlanChapter, 'raceDate' | 'distanceKm'>,
  run: ActivitySummary | undefined,
  loadActivity: ((id: string) => Promise<Activity>) | undefined,
) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = run && loadActivity ? JSON.stringify([chapter.raceDate, chapter.distanceKm, run.id, run.localDate, run.kind, run.distanceKm, run.movingSeconds, attempt]) : ''
  const load = useEffectEvent(async () => verifyRaceRecording(chapter, run!, await loadActivity!(run!.id)))
  useEffect(() => {
    if (!key) return
    let current = true
    load().then(activity => { if (current) setPreview({ key, activity }) })
      .catch((reason: unknown) => { if (current) setPreview({ key, error: reason instanceof Error ? reason.message : 'The recording couldn’t load. Try again or add a result.' }) })
    return () => { current = false }
  }, [key])
  return {
    activity: preview?.key === key ? preview.activity : undefined,
    error: preview?.key === key ? preview.error : undefined,
    loading: !!key && preview?.key !== key,
    retry: () => setAttempt(value => value + 1),
  }
}
