import { useEffect, useRef, useState } from 'react'
import { useAuth, type Auth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { ActivitySummary, DayOfWeek } from '../../lib/types'
import { FinishLineFilm } from './FinishLineFilm'
import { storyFromChapter } from './journey-story'
import { achievement, distanceBadge, formatClock, isLiveRecovery, OUTCOME_WORDS } from './journey-model'
import { RecoveryOffer } from './Recovery'
import { RaceResultForm } from './RaceResultForm'
import { TrainingStory } from './TrainingStory'
import type { JourneyLifecycle, PlanChapter } from './types'
import { useJourney } from './useJourney'
import './journey.css'

const LIFECYCLE_WORDS: Record<JourneyLifecycle, string> = {
  Active: 'In training',
  TrainingComplete: 'Training complete',
  RacePending: 'Race result to add',
  RaceCompleted: 'Race finished',
  RaceNotCompleted: 'Race recorded',
  Recovering: 'Recovering',
  Recovered: 'Recovered',
  Archived: 'Past plan',
}

type Detail = { owner: Auth } & ({ kind: 'loading'; planId: string } | { kind: 'ready'; chapter: PlanChapter; runs: ActivitySummary[] | null } | { kind: 'error'; planId: string; message: string })

/**
 * The runner's running journey: every plan they've finished or moved on from, newest first, with its training story,
 * race result and achievements. Account-backed, so it's the same on every device and survives building a new plan.
 */
export function RunningJourney({ units, today, runDays = [] }: { units: Units; today: string; runDays?: DayOfWeek[] }) {
  const auth = useAuth()
  const { state, actions } = useJourney(true)
  const [loaded, setDetail] = useState<Detail | null>(null)
  const detail = loaded?.owner === auth ? loaded : null
  const [replay, setReplay] = useState<{ chapter: PlanChapter; trigger: HTMLElement } | null>(null)
  const [manual, setManual] = useState(false)
  const request = useRef(0)
  useEffect(() => {
    const requests = request
    return () => { requests.current++ }
  }, [auth])

  const open = async (planId: string, reload = false) => {
    const mine = ++request.current
    if (!reload && detail && detail.kind === 'ready' && detail.chapter.planId === planId) { setDetail(null); return }
    setDetail({ kind: 'loading', planId, owner: auth })
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Sign in again to open this plan.')
      // The past chapter already has a race date; retrieve the runner's imported runs beside it.
      // A temporary activity-list failure must not hide their training history.
      const [chapter, runs] = await Promise.all([
        api.me.journey.chapter(token, planId),
        api.me.activities(token).catch(() => null),
      ])
      if (mine !== request.current) return
      setDetail({ kind: 'ready', chapter, runs, owner: auth })
    } catch (reason) {
      if (mine !== request.current) return
      setDetail({ kind: 'error', planId, owner: auth, message: reason instanceof Error ? reason.message : 'This plan couldn’t open.' })
    }
  }

  if (state.kind === 'off') return null
  if (state.kind === 'loading') return <p className="field-help" role="status">Loading your running journey…</p>
  if (state.kind === 'error') {
    return (
      <div className="journey-state" role="alert">
        <p>Your running journey couldn’t load. {state.message}</p>
        <button type="button" className="button" onClick={actions.refresh}>Try again</button>
      </div>
    )
  }

  const { chapters } = state.journey
  const finishes = chapters.filter(chapter => achievement(chapter, 'RaceFinished'))
  const completions = chapters.filter(chapter => achievement(chapter, 'TrainingComplete')).length

  return (
    <div className="running-journey">
      {replay && (
        <FinishLineFilm variant="training" heading="YOU DID IT." lede="Every planned training run, confirmed." raceName={replay.chapter.raceName}
          metrics={[{ value: String(replay.chapter.training.confirmedRuns), label: 'Training runs confirmed' }, { value: String(replay.chapter.training.weeks), label: 'Weeks' }]}
          primaryLabel="Back to my journey" onPrimary={() => setReplay(null)} onClose={() => setReplay(null)} returnFocus={() => replay.trigger} />
      )}
      <p className="journey-lede">Every finish is a beginning.</p>
      {state.refreshFailed && <p className="field-help" role="status">Showing your journey as last loaded; it couldn’t refresh just now.</p>}
      {(finishes.length > 0 || completions > 0) && (
        <ul className="journey-badges is-large" aria-label="Your achievements">
          {finishes.map(chapter => <li key={chapter.planId} className="is-earned">✓ {distanceBadge(chapter.raceResult?.distanceKm ?? chapter.distanceKm)}<small>{chapter.raceName}</small></li>)}
          {completions > 0 && <li className="is-earned">✓ {completions} training {completions === 1 ? 'plan' : 'plans'} complete</li>}
        </ul>
      )}
      {chapters.length === 0 ? (
        <p className="journey-empty">Your finished plans and race results will collect here, with every achievement you earn.</p>
      ) : (
        <ol className="journey-chapters" aria-label="Your plans">
          {chapters.map(chapter => {
            const result = chapter.raceResult
            const opened = detail && (detail.kind === 'ready' ? detail.chapter.planId : detail.planId) === chapter.planId ? detail : null
            return (
              <li key={chapter.planId} className="journey-chapter">
                <div className="journey-chapter-head">
                  <div>
                    <p className="journey-chapter-name">{chapter.raceName}</p>
                    <p className="field-help">{chapter.raceDate ? formatDate(chapter.raceDate, 'long') : 'No race date'} · {chapter.status === 'Active' ? 'Current plan' : 'Past plan'}</p>
                  </div>
                  <span className={`journey-lifecycle is-${chapter.lifecycle}`}>{LIFECYCLE_WORDS[chapter.lifecycle]}</span>
                </div>
                <p className="journey-chapter-facts">
                  <span className="mono">{chapter.training.confirmedRuns}/{chapter.training.scheduledRuns}</span> runs confirmed
                  {chapter.training.recordedKm !== null && <> · <span className="mono">{formatDistance(chapter.training.recordedKm, units)}</span> recorded</>}
                  {result && <> · {OUTCOME_WORDS[result.outcome]}{formatClock(result.finishTime) && <> in <span className="mono">{formatClock(result.finishTime)}</span></>}</>}
                </p>
                <ul className="journey-badges" aria-label={`Achievements for ${chapter.raceName}`}>
                  {chapter.achievements.length === 0 && <li className="is-open">No achievements on this plan yet</li>}
                  {chapter.achievements.map(award => <li key={award.id} className="is-earned">✓ {award.kind === 'RaceFinished' ? 'Race finisher' : 'Training complete'} · {formatDate(award.earnedOn, 'dayMonth')}</li>)}
                </ul>
                <div className="journey-actions">
                  <button type="button" className="button" aria-expanded={!!opened && opened.kind === 'ready'} onClick={() => void open(chapter.planId)}>
                    {opened?.kind === 'ready' ? 'Close chapter' : 'View chapter'}
                  </button>
                  {achievement(chapter, 'TrainingComplete') && <button type="button" className="button button-quiet" onClick={(event) => setReplay({ chapter, trigger: event.currentTarget })}>Replay finish line</button>}
                </div>
                {opened?.kind === 'loading' && <p className="field-help" role="status">Opening…</p>}
                {opened?.kind === 'error' && <p className="field-error" role="alert">{opened.message}</p>}
                {opened?.kind === 'ready' && (
                  <div className="journey-chapter-story">
                    {opened.runs === null && (
                      <div role="status">
                        <p>Your recorded runs couldn’t load. You can still enter your result manually.</p>
                        <button type="button" className="button" onClick={() => void open(opened.chapter.planId, true)}>Retry recorded runs</button>
                      </div>
                    )}
                    {opened.chapter.raceDate && opened.chapter.raceDate <= today && (
                      <RaceResultForm
                        key={opened.chapter.planId}
                        chapter={opened.chapter}
                        today={today}
                        units={units}
                        runs={opened.runs ?? undefined}
                        onLoadActivity={async id => {
                          const token = await auth.getToken()
                          if (!token) throw new Error('Sign in again to load this recording.')
                          return api.me.activity(token, id)
                        }}
                        onSave={async body => {
                          const result = await actions.saveRaceResult(opened.chapter.planId, body)
                          setDetail(previous => previous?.kind === 'ready' && previous.chapter.planId === opened.chapter.planId
                            ? { ...previous, chapter: { ...previous.chapter, raceResult: result } } : previous)
                          return result
                        }}
                        onDelete={async () => {
                          await actions.deleteRaceResult(opened.chapter.planId)
                          setDetail(previous => previous?.kind === 'ready' && previous.chapter.planId === opened.chapter.planId
                            ? { ...previous, chapter: { ...previous.chapter, raceResult: null } } : previous)
                        }}
                      />
                    )}
                    <TrainingStory story={storyFromChapter(opened.chapter)} units={units} raceResult={opened.chapter.raceResult} />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {!isLiveRecovery(state.journey.recovery) && (
        manual
          ? <RecoveryOffer today={today} runDays={runDays} onStart={async (body) => { await actions.startRecovery(body); setManual(false) }} onDecline={() => setManual(false)} />
          : <button type="button" className="link-button journey-link" onClick={() => setManual(true)}>Ran a race outside Taperday? Plan your recovery</button>
      )}
    </div>
  )
}
