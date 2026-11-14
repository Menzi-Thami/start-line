import { useState } from 'react'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import { downloadCard, shareCard, type CardContent } from './share-card'
import { highlights, type StoryData } from './journey-story'

interface Props {
  story: StoryData
  units: Units
  onReplay?: (trigger: HTMLElement) => void
  onNext?: () => void
  nextLabel?: string
}

/**
 * The training story: what was confirmed, what was measured and what was only planned, each labelled for what it is. A
 * share card can be saved or shared; it holds the runner's own numbers and nothing more.
 */
export function TrainingStory({ story, units, onReplay, onNext, nextLabel = 'Plan my next challenge' }: Props) {
  const [notice, setNotice] = useState<string | null>(null)
  const card: CardContent = {
    kicker: 'TAPERDAY · FINISH LINE',
    heading: story.earned ? 'TRAINING COMPLETE' : 'MY TRAINING STORY',
    raceName: story.raceName,
    stats: [
      { value: `${story.confirmedRuns}/${story.scheduledRuns}`, label: 'Training runs confirmed' },
      { value: String(story.weeks), label: story.weeks === 1 ? 'Week of training' : 'Weeks of training' },
      story.recordedKm !== null
        ? { value: formatDistance(story.recordedKm, units), label: 'Recorded distance' }
        : { value: formatDistance(story.plannedKmConfirmed, units), label: 'Planned distance, confirmed runs' },
    ],
    footer: 'Every finish is a beginning.  taperday.run',
  }
  const shareText = `My Taperday training story for ${story.raceName}: ${story.confirmedRuns} of ${story.scheduledRuns} training runs confirmed over ${story.weeks} weeks. #Taperday`
  const fileName = 'taperday-training-story'
  const download = async () => {
    try {
      const kind = await downloadCard(card, fileName)
      setNotice(kind === 'png' ? 'Card saved as a picture.' : 'Card saved as an SVG picture.')
    } catch {
      setNotice('The card couldn’t be saved on this device. Try sharing it instead.')
    }
  }
  const share = async () => {
    const outcome = await shareCard(card, shareText, fileName)
    setNotice(outcome === 'shared' ? 'Shared.' : outcome === 'copied' ? 'Copied your story to the clipboard.' : outcome === 'cancelled' ? null : 'Sharing isn’t available here. Save the card instead.')
  }
  const lines = highlights(story)
  const most = Math.max(1, ...(story.weekly ?? []).map(week => week.scheduledRuns))

  return (
    <section className="training-story" aria-labelledby="training-story-title">
      <p className="plan-kicker">Your training story</p>
      <h3 id="training-story-title" className="training-story-title">{story.raceName}</h3>
      <dl className="training-story-stats">
        <div><dt>Training runs confirmed</dt><dd className="mono">{story.confirmedRuns}/{story.scheduledRuns}</dd></div>
        <div><dt>Weeks</dt><dd className="mono">{story.weeks}</dd></div>
        {story.runningDays !== null && <div><dt>Days you ran</dt><dd className="mono">{story.runningDays}</dd></div>}
        <div>
          <dt>Recorded distance</dt>
          {story.recordedKm !== null
            ? <dd className="mono">{formatDistance(story.recordedKm, units)}<small>{story.recordedRuns} {story.recordedRuns === 1 ? 'run' : 'runs'} with a distance you gave or uploaded</small></dd>
            : <dd className="training-story-unknown">Not enough evidence<small>No distances were logged or uploaded, so none is shown.</small></dd>}
        </div>
        <div><dt>Planned distance of confirmed runs</dt><dd className="mono">{formatDistance(story.plannedKmConfirmed, units)}<small>What the plan asked for, not a measurement</small></dd></div>
        <div>
          <dt>Longest recorded run</dt>
          {story.longestRecordedKm !== null
            ? <dd className="mono">{formatDistance(story.longestRecordedKm, units)}{story.longestRecordedOn && <small>{formatDate(story.longestRecordedOn, 'dayMonth')}</small>}</dd>
            : <dd className="training-story-unknown">Not recorded<small>Log a distance or upload a run to see it here.</small></dd>}
        </div>
      </dl>
      {story.provisional > 0 && (
        <p className="training-story-note">
          {story.provisional} more {story.provisional === 1 ? 'run was' : 'runs were'} matched from Strava but not confirmed. Strava copies are temporary, so
          they don’t count until you tick them.
        </p>
      )}
      {(story.skippedRuns > 0 || story.scheduledRuns > story.confirmedRuns) && !story.earned && (
        <p className="training-story-note">
          Runs you skipped or didn’t log aren’t counted as done. You can still open a past day on the calendar and record it.
        </p>
      )}
      {lines.length > 0 && (
        <ul className="training-story-highlights" aria-label="Highlights">
          {lines.map(line => <li key={line}>{line}</li>)}
        </ul>
      )}
      {story.weekly && story.weekly.length > 0 && (
        <figure className="training-story-weeks">
          <figcaption>Confirmed runs, week by week</figcaption>
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
      {story.source === 'device' && (
        <p className="field-help">This story comes from this device only. Sign in to keep it, with your race results, on every device.</p>
      )}
      <div className="journey-actions">
        <button type="button" className="button button-primary" onClick={() => void download()}>Download card</button>
        <button type="button" className="button" onClick={() => void share()}>Share</button>
        {onReplay && <button type="button" className="button button-quiet" onClick={(event) => onReplay(event.currentTarget)}>Replay finish line</button>}
        {onNext && <button type="button" className="button button-quiet" onClick={onNext}>{nextLabel}</button>}
      </div>
      <p className="field-help" role="status" aria-live="polite">{notice}</p>
    </section>
  )
}
