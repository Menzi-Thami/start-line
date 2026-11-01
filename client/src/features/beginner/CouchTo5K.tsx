import { useState } from 'react'
import { beginnerSessionSummary, couchTo5k } from './couch-to-5k'

/** The free beginner programme can be explored before creating an account.
 * This preview does not claim to be a saved plan or persist completed workouts.
 */
export function CouchTo5K() {
  const [week, setWeek] = useState(1)
  const sessions = couchTo5k().filter(s => s.week === week)
  return (
    <section className="panel" aria-labelledby="beginner-title">
      <p className="field-help">BEGINNER · NINE WEEKS · THREE SESSIONS EACH WEEK</p>
      <h2 id="beginner-title">Couch to 5K</h2>
      <p>Start with short, comfortable run/walk intervals. Three sessions a week with a rest day between sessions. Repeat a week whenever you need to. There is no required pace.</p>
      <div className="wizard-nav">
        <button className="button button-quiet" type="button" disabled={week === 1} onClick={() => setWeek(w => Math.max(1, w - 1))}>Previous week</button>
        <strong aria-live="polite">Week {week} of 9</strong>
        <button className="button button-quiet" type="button" disabled={week === 9} onClick={() => setWeek(w => Math.min(9, w + 1))}>Next week</button>
      </div>
      <ol className="days">
        {sessions.map(session => (
          <li className="day" key={session.day}>
            <div><strong>Session {session.day}</strong><p className="field-help">5 min brisk walking warm-up</p>
              <p>{beginnerSessionSummary(session)}</p><p className="field-help">5 min walking cool-down · About {Math.round(session.totalSeconds / 60)} minutes total</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="field-help">After week nine, aim to jog comfortably for 30 minutes. That may not yet be 5 km — build distance gradually. If you're new to exercise or managing an injury, adapt with professional guidance.</p>
    </section>
  )
}
