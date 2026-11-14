import { useState } from 'react'
import { Runner } from '../shared/Runner'
import { formatDistance } from '../../lib/format'
import type { Units } from '../../lib/format'
import type { TrainingPlan } from '../../lib/types'
import { finishLineSummary } from './finish-line-model'
import './finish-line.css'

type Summary = ReturnType<typeof finishLineSummary>

function seenKey(plan: TrainingPlan) {
  return `taperday:finish-line:v1:${plan.race.name}|${plan.race.date}|${plan.startDate}`
}
function previouslySeen(key: string) {
  try { return localStorage.getItem(key) === 'seen' } catch { return false }
}
function remember(key: string) {
  try { localStorage.setItem(key, 'seen') } catch { /* The celebration still works without storage. */ }
}
function safeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function FinishLine({ plan, summary, units, onNextPlan }: { plan: TrainingPlan; summary: Summary; units: Units; onNextPlan?: () => void }) {
  const key = seenKey(plan)
  const [celebrating, setCelebrating] = useState(() => summary.earned && !previouslySeen(key))
  const [copied, setCopied] = useState(false)
  const finish = () => { remember(key); setCelebrating(false) }
  const message = summary.earned ? 'Training plan complete' : 'Your training chapter'
  const detail = summary.earned
    ? 'Every planned training run is checked off. Your work deserves its moment.'
    : 'Race day has passed. Here is what you confirmed along the way — unfinished workouts are not counted as completed.'
  const shareText = `My Taperday training journey: ${summary.completed} of ${summary.total} workouts confirmed over ${summary.weeks} weeks. ${formatDistance(summary.distanceKm, units)} of planned completed-session distance. #Taperday`
  const downloadCard = () => {
    const heading = summary.earned ? 'TRAINING COMPLETE' : 'MY TRAINING JOURNEY'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#0B0E12"/><text x="80" y="126" fill="#C6FF3E" font-family="Arial,sans-serif" font-size="34" font-weight="bold">TAPERDAY / FINISH LINE</text><text x="80" y="360" fill="#fff" font-family="Arial,sans-serif" font-size="77" font-weight="bold">${heading}</text><text x="80" y="450" fill="#fff" font-family="Arial,sans-serif" font-size="40">${safeXml(plan.race.name.slice(0, 40))}</text><path d="M80 535 H1000" stroke="#C6FF3E" stroke-width="6"/><text x="80" y="740" fill="#C6FF3E" font-family="Arial,sans-serif" font-size="155" font-weight="bold">${summary.completed}/${summary.total}</text><text x="80" y="810" fill="#fff" font-family="Arial,sans-serif" font-size="34">CONFIRMED TRAINING RUNS</text><text x="80" y="985" fill="#C6FF3E" font-family="Arial,sans-serif" font-size="108" font-weight="bold">${safeXml(formatDistance(summary.distanceKm, units))}</text><text x="80" y="1050" fill="#fff" font-family="Arial,sans-serif" font-size="34">PLANNED DISTANCE OF CONFIRMED RUNS</text><text x="80" y="1250" fill="#fff" font-family="Arial,sans-serif" font-size="32">Every finish is a beginning.    taperday.run</text></svg>`
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'taperday-training-journey.svg'
    link.click()
    URL.revokeObjectURL(url)
  }
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: shareText, title: 'My Taperday training journey' }); return } catch { /* May be cancelled or unsupported. */ }
    }
    try { await navigator.clipboard.writeText(shareText); setCopied(true) } catch { setCopied(false) }
  }
  return <section className="finish-line" aria-label="Taperday Finish Line">
    {celebrating && <div className="finish-line-celebration" role="dialog" aria-modal="true" aria-label="Training complete">
      <div className="finish-line-film">
        <p className="finish-line-kicker">TAPERDAY / FINISH LINE</p>
        <div className="finish-line-runner"><Runner pose="victory" size={110} /></div>
        <h2>YOU DID IT.</h2>
        <p>All ${summary.total} training runs complete.</p>
        <button type="button" className="button button-primary" onClick={finish}>See my training story</button>
      </div>
    </div>}
    <p className="finish-line-kicker">TAPERDAY / FINISH LINE</p>
    <h3>{message}</h3>
    <p>{detail}</p>
    <div className="finish-line-stats">
      <div><strong>{summary.completed}/{summary.total}</strong><span>Confirmed runs</span></div>
      <div><strong>{summary.weeks}</strong><span>Plan weeks</span></div>
      <div><strong>{formatDistance(summary.distanceKm, units)}</strong><span>Planned distance completed</span></div>
    </div>
    {summary.provisional > 0 && <p className="finish-line-caveat">{summary.provisional} additional run(s) matched by Strava provisionally. Confirm them to make the achievement permanent.</p>}
    {summary.earned && !summary.racePassed && <p className="finish-line-next">Training is complete, but your race is still ahead. Rest, recover and get ready for the start line.</p>}
    {summary.racePassed && <p className="finish-line-next">Did you race? Review your recorded run in Runs. Completing training does not automatically mean the race was completed.</p>}
    <div className="finish-line-actions">
      <button type="button" className="button" onClick={downloadCard}>Download achievement card</button>
      <button type="button" className="button button-quiet" onClick={share}>{copied ? 'Copied!' : 'Share journey'}</button>
      {summary.earned && <button type="button" className="button button-quiet" onClick={() => setCelebrating(true)}>Replay finish line</button>}
      {onNextPlan && <button type="button" className="button button-quiet" onClick={onNextPlan}>Plan my next challenge</button>}
    </div>
  </section>
}
