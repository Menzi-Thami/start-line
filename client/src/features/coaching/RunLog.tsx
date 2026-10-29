import { useId, useState } from 'react'
import type { ActivitySummary, CheckIn, Session, TrainingPlan } from '../../lib/types'
import { CheckInCard } from './CheckInCard'
import { AdditionalRun } from './AdditionalRun'
import type { SessionCoach } from './useCheckIns'

// getRandomValues is also available on browsers that do not expose randomUUID.
function newEntryId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 15) | 64
  bytes[8] = (bytes[8]! & 63) | 128
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Add a run on a rest day or alongside a planned session, without claiming the prescribed workout was done. */
export function RunLog({
  plan,
  coach,
  runs = [],
  initialRun,
  fixedDate,
  onClose,
  showEntries = true,
}: {
  plan: TrainingPlan
  coach: SessionCoach
  runs?: readonly ActivitySummary[]
  initialRun?: ActivitySummary
  fixedDate?: string
  onClose?: () => void
  showEntries?: boolean
}) {
  const label = useId()
  const [open, setOpen] = useState(!!initialRun)
  const [date, setDate] = useState(initialRun?.localDate ?? fixedDate ?? (coach.today < plan.race.date ? coach.today : plan.race.date))
  const [entryId, setEntryId] = useState(() => newEntryId())
  const [target, setTarget] = useState('additional')
  if (!coach.saveAdditional || !coach.removeAdditional || coach.today < plan.startDate) return null
  const sessions = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.date === date && s.type !== 'Strength' && s.type !== 'Race')
  const selected = target === 'additional' ? null : sessions.find((s) => s.type === target)
  const additionalSession: Session = {
    date,
    type: 'Easy',
    title: 'Additional run',
    detail: '',
    purpose: '',
    distanceKm: 0,
    zone: null,
    exercises: [],
    steps: [],
  }
  const extraCoach = (entry?: CheckIn): SessionCoach => ({
    ...coach,
    get: () => entry,
    save: (session, answers) =>
      coach.saveAdditional!(entry?.id ?? entryId, session, { ...answers, distanceUnreported: answers.distanceKm == null }),
    remove: () => coach.removeAdditional!(entry?.id ?? entryId),
  })
  const close = () => {
    setOpen(false)
    setEntryId(newEntryId())
    onClose?.()
  }
  return (
    <section className="run-log" aria-label="Your run log">
      {!open ? (
        <button
          type="button"
          className="button button-quiet"
          onClick={() => {
            setEntryId(newEntryId())
            setOpen(true)
          }}
        >
          Log a run
        </button>
      ) : (
        <>
          <div className="run-log-choices">
            <div className="field">
              <label className="field-label" htmlFor={`${label}-date`}>
                Run date
              </label>
              <input
                className="input"
                id={`${label}-date`}
                type="date"
                min={plan.startDate}
                max={coach.today < plan.race.date ? coach.today : plan.race.date}
                value={date}
                readOnly={fixedDate !== undefined}
                onChange={(e) => {
                  setDate(e.target.value)
                  setTarget('additional')
                  setEntryId(newEntryId())
                }}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${label}-target`}>
                How does this fit your plan?
              </label>
              <select
                className="input"
                id={`${label}-target`}
                value={selected?.type ?? 'additional'}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="additional">Additional run — keep planned workouts outstanding</option>
                {sessions.map((s) => (
                  <option key={s.type} value={s.type}>
                    Replaces: {s.title}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="link-button" onClick={close}>
              Cancel logging
            </button>
          </div>
          {date >= plan.startDate && date <= coach.today && date <= plan.race.date && (
            <CheckInCard
              key={`${date}|${target}|${entryId}`}
              session={selected ?? additionalSession}
              coach={selected ? coach : extraCoach()}
              additional={!selected}
              runs={runs}
              initialOpen
              onClose={close}
              initialActivityId={initialRun?.localDate === date ? initialRun.id : undefined}
            />
          )}
          {(!date || date < plan.startDate || date > coach.today || date > plan.race.date) && (
            <p className="field-error" role="alert">
              Choose a date within your plan that has already arrived.
            </p>
          )}
        </>
      )}
      {(showEntries ? (coach.entries ?? []) : [])
        .filter((c) => c.isAdditional)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((entry) => (
          <AdditionalRun key={entry.id} entry={entry} coach={coach} runs={runs} showDate />
        ))}
    </section>
  )
}
