import { useEffect, useId, useMemo, useState } from 'react'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import { formatClock } from './journey-model'
import { downloadCard, prepareCard, shareCard, type CardContent } from './share-card'
import { highlights, type StoryData } from './journey-story'
import type { RaceResult } from './types'

interface Props {
  story: StoryData
  units: Units
  raceResult?: RaceResult | null
  onReplay?: (trigger: HTMLElement) => void
  onNext?: () => void
  nextLabel?: string
}

/**
 * A finish-line editorial recap, not a spreadsheet. Measured, planned and runner-confirmed
 * figures remain visibly distinct. The same trusted figures go into the downloadable share card.
 */
export function TrainingStory({ story, units, raceResult, onReplay, onNext, nextLabel = 'Plan my next challenge' }: Props) {
  const titleId = useId()
  const [notice, setNotice] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [prepared, setPrepared] = useState<{ key: string; file: File | null } | null>(null)
  const isFinisher = raceResult?.outcome === 'Finished'
  const finishTime = isFinisher ? formatClock(raceResult?.finishTime) : null
  const completion = story.scheduledRuns > 0 ? Math.min(100, Math.round(100 * story.confirmedRuns / story.scheduledRuns)) : 0
  const card = useMemo<CardContent>(() => ({
    kicker: isFinisher ? 'TAPERDAY · RACE FINISH' : 'TAPERDAY · TRAINING STORY',
    heading: isFinisher ? 'RACE FINISHED' : story.earned ? 'TRAINING COMPLETE' : 'MY TRAINING STORY',
    raceName: story.raceName,
    stats: [
      ...(finishTime ? [{ value: finishTime, label: 'Race result time' }] : []),
      ...(isFinisher && raceResult.distanceKm != null ? [{ value: formatDistance(raceResult.distanceKm, units), label: 'Race distance' }] : []),
      { value: `${story.confirmedRuns}/${story.scheduledRuns}`, label: 'Training runs confirmed' },
      { value: String(story.weeks), label: story.weeks === 1 ? 'Training week' : 'Training weeks' },
      story.recordedKm !== null
        ? { value: formatDistance(story.recordedKm, units), label: 'Recorded training distance' }
        : { value: formatDistance(story.plannedKmConfirmed, units), label: 'Plan distance of confirmed runs' },
    ].slice(0, 3),
    footer: 'EVERY FINISH IS A BEGINNING  ·  taperday.run',
  }), [finishTime, isFinisher, raceResult, story.confirmedRuns, story.scheduledRuns, story.weeks,
    story.recordedKm, story.plannedKmConfirmed, story.earned, story.raceName, units])
  const shareText = isFinisher
    ? `I finished ${story.raceName}${finishTime ? ` in ${finishTime}` : ''}! My Taperday story: ${story.confirmedRuns} confirmed training runs over ${story.weeks} weeks. #Taperday`
    : `My Taperday training story for ${story.raceName}: ${story.confirmedRuns} of ${story.scheduledRuns} training runs confirmed over ${story.weeks} weeks. #Taperday`
  const fileName = isFinisher ? 'taperday-race-finish' : 'taperday-training-story'
  const needsFile = typeof navigator.share === 'function'
  const cardKey = JSON.stringify({ card, fileName })
  useEffect(() => {
    if (!needsFile) return
    let current = true
    prepareCard(card, fileName).then(file => { if (current) setPrepared({ key: cardKey, file }) })
      .catch(() => { if (current) setPrepared({ key: cardKey, file: null }) })
    return () => { current = false }
  }, [card, cardKey, fileName, needsFile])
  const download = async () => {
    try {
      const kind = await downloadCard(card, fileName)
      setNotice(kind === 'png' ? 'Card saved as a picture.' : 'Card saved as an SVG picture.')
    } catch {
      setNotice('The card couldn’t be saved on this device. Try sharing it instead.')
    }
  }
  const share = async () => {
    if (sharing || (needsFile && prepared?.key !== cardKey)) return
    setSharing(true)
    try {
      const outcome = await shareCard(card, shareText, fileName, needsFile ? prepared?.file : null)
      setNotice(outcome === 'shared' ? 'Shared.' : outcome === 'copied' ? 'Copied your story to the clipboard.' : outcome === 'cancelled' ? null : 'Sharing isn’t available here. Save the card instead.')
    } finally { setSharing(false) }
  }
  const lines = highlights(story)
  const most = Math.max(1, ...(story.weekly ?? []).map(week => week.scheduledRuns))

  return (
    <section className="training-story" aria-labelledby={titleId}>
      <header className="training-story-hero">
        <div className="training-story-topline"><span className="plan-kicker">THE WORK BEHIND THE FINISH</span><span className="training-story-chapter">{story.earned ? 'CHAPTER COMPLETE' : 'YOUR CHAPTER'}</span></div>
        <h3 id={titleId} className="training-story-title">{story.raceName}</h3>
        <div className="training-story-lead">
          <strong className="mono">{story.confirmedRuns}<span>/{story.scheduledRuns}</span></strong>
          <div className="training-story-lead-copy">
            <span>Training runs confirmed</span>
            <p>Every session here represents the work you actually confirmed, not just what was scheduled.</p>
          </div>
        </div>
        <div className="training-story-meter" role="progressbar" aria-label="Training runs confirmed" aria-valuenow={story.confirmedRuns} aria-valuemin={0} aria-valuemax={Math.max(1, story.scheduledRuns)}>
          <span style={{ width: `${completion}%` }} />
        </div>
        <p className="training-story-percent mono">{completion}% of your training runs confirmed</p>
      </header>

      <dl className="training-story-stats">
        <div><dt>Weeks of training</dt><dd className="mono">{story.weeks}</dd></div>
        {story.runningDays !== null && <div><dt>Days you ran</dt><dd className="mono">{story.runningDays}</dd></div>}
        <div>
          <dt>Distance you recorded</dt>
          {story.recordedKm !== null
            ? <dd className="mono">{formatDistance(story.recordedKm, units)}<small>{story.recordedRuns} {story.recordedRuns === 1 ? 'recorded run' : 'recorded runs'} · measured or logged</small></dd>
            : <dd className="training-story-unknown">Not enough evidence<small>No recorded training distance available</small></dd>}
        </div>
        <div>
          <dt>Longest recorded training run</dt>
          {story.longestRecordedKm !== null
            ? <dd className="mono">{formatDistance(story.longestRecordedKm, units)}{story.longestRecordedOn && <small>{formatDate(story.longestRecordedOn, 'dayMonth')}</small>}</dd>
            : <dd className="training-story-unknown">Not recorded<small>No measurement available</small></dd>}
        </div>
      </dl>
      <details className="training-story-method">
        <summary>How these numbers were counted</summary>
        <p>Recorded distance comes from distances you entered or uploaded. Planned distance is not a measurement, and runs not confirmed don't count as done.</p>
        <p><strong>Planned distance for confirmed runs:</strong> {formatDistance(story.plannedKmConfirmed, units)}</p>
      </details>
      {story.provisional > 0 && (
        <p className="training-story-note">
          {story.provisional} more {story.provisional === 1 ? 'run was' : 'runs were'} matched from Strava but not confirmed. Cached copies aren’t counted until you confirm the runs.
        </p>
      )}
      {(story.skippedRuns > 0 || story.scheduledRuns > story.confirmedRuns) && !story.earned && (
        <p className="training-story-note">
          Runs you skipped or didn’t log aren’t counted as done. You can still open a past day on the calendar and record it.
        </p>
      )}
      {lines.length > 0 && (
        <div className="training-story-highlights-wrap">
          <h4>Moments worth remembering</h4>
          <ul className="training-story-highlights" aria-label="Highlights">
            {lines.map(line => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}
      {story.weekly && story.weekly.length > 0 && (
        <figure className="training-story-weeks">
          <figcaption><strong>Every week tells a story.</strong><span>Confirmed runs, week by week</span></figcaption>
          <ol>
            {story.weekly.map((week, i) => (
              <li key={week.weekStart} aria-label={`Week ${i + 1}: ${week.confirmedRuns} of ${week.scheduledRuns} runs confirmed`}>
                <span className="training-story-bar" aria-hidden="true">
                  <span className="is-planned" style={{ height: `${(week.scheduledRuns / most) * 100}%` }} />
                  <span className="is-done" style={{ height: `${(week.confirmedRuns / most) * 100}%` }} />
                </span>
                <span className="training-story-week" aria-hidden="true">{i + 1}</span>
              </li>
            ))}
          </ol>
        </figure>
      )}
      <section className="training-story-share" aria-label="Share your training story">
        <div>
          <p className="plan-kicker">YOUR STORY. YOUR FINISH LINE.</p>
          <h4>A finish worth sharing.</h4>
          <p>Make a Taperday story card with your real numbers. No routes or private details.</p>
        </div>
        <div className="journey-actions">
          <button type="button" className="button button-primary" disabled={sharing || (needsFile && prepared?.key !== cardKey)} onClick={() => void share()}>Share my story</button>
          <button type="button" className="button" onClick={() => void download()}>Save story card</button>
        </div>
      </section>
      {story.source === 'device' && (
        <p className="field-help">This story comes from this device only. Sign in to keep it, with your race results, on every device.</p>
      )}
      {(onReplay || onNext) && <div className="journey-actions">
        {onReplay && <button type="button" className="button button-quiet" onClick={(event) => onReplay(event.currentTarget)}>Replay finish line</button>}
        {onNext && <button type="button" className="button button-quiet" onClick={onNext}>{nextLabel}</button>}
      </div>}
      <p className="field-help" role="status" aria-live="polite">{notice}</p>
    </section>
  )
}
