import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api, type Insights } from '../../lib/api-client'
import { formatDate } from '../../lib/format'

/**
 * Taperday stats, for its maker only: how many runners, how far they got and the latest feedback. The API answers only
 * for the emails in Insights:AdminEmails, so for everyone else this renders nothing.
 */
export function TaperdayStats() {
  const auth = useAuth()
  const [stats, setStats] = useState<Insights | null>(null)

  useEffect(() => {
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.insights(token) : null))
      .then((s) => {
        if (!cancelled) setStats(s)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [auth])

  if (!stats) return null
  const share = (n: number) => (stats.runners > 0 ? ` (${Math.round((n / stats.runners) * 100)}%)` : '')
  const rows: [string, string][] = [
    ['Runners', `${stats.runners}${stats.newThisWeek ? ` · ${stats.newThisWeek} new this week` : ''}`],
    ['With a current plan', `${stats.withCurrentPlan}${share(stats.withCurrentPlan)}`],
    ['With runs on Taperday', `${stats.withRuns}${share(stats.withRuns)}`],
    ['Strava connected', `${stats.stravaConnected}${share(stats.stravaConnected)}`],
    ['Reminders on', `${stats.remindersOn}${share(stats.remindersOn)}`],
    ['Ran this week', `${stats.ranThisWeek}`],
    ['Runs stored', `${stats.runs}`],
  ]
  return (
    <div className="section taperday-stats">
      <h3>Taperday stats</h3>
      <p className="field-help">Only you see this. Counts only, no names.</p>
      <dl className="stats-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="mono">{value}</dd>
          </div>
        ))}
      </dl>
      <h4>Latest feedback</h4>
      {stats.feedback.length === 0 ? (
        <p className="field-help">No feedback yet.</p>
      ) : (
        <ul className="feedback-list">
          {stats.feedback.map((f) => (
            <li key={f.at}>
              <p>{f.message}</p>
              <p className="field-help">
                {formatDate(f.at.slice(0, 10))}
                {f.page ? ` · ${f.page}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
