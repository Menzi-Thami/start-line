import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { SaveShoe, Shoe, UnwornRun } from '../../lib/types'

type State = { kind: 'loading' } | { kind: 'ready'; shoes: Shoe[] } | { kind: 'error'; message: string }

const WEAR_WORDS = { Fine: null, NearingLimit: 'Nearing its limit', PastLimit: 'Past its limit: time for a new pair?' } as const

const blank: SaveShoe = { name: '', startingKm: 0, limitKm: 700, isDefault: false, remindAtLimit: true, retired: false }

const toRequest = (shoe: Shoe, changes: Partial<SaveShoe> = {}): SaveShoe => ({
  name: shoe.name,
  startingKm: shoe.startingKm,
  limitKm: shoe.limitKm,
  isDefault: shoe.isDefault,
  remindAtLimit: shoe.remindAtLimit,
  retired: shoe.retired,
  ...changes,
})

/** Add or edit a pair: name, distance already run, when to replace it, default and reminder. */
function ShoeForm({ initial, submitLabel, busy, onSubmit, onCancel }: {
  initial: SaveShoe
  submitLabel: string
  busy: boolean
  onSubmit: (shoe: SaveShoe) => void
  onCancel?: () => void
}) {
  const id = useId()
  const [shoe, setShoe] = useState(initial)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit({ ...shoe, name: shoe.name.trim() })
  }
  return (
    <form className="shoe-form" onSubmit={submit}>
      <label className="field" htmlFor={`${id}-name`}>
        <span className="field-label">Name</span>
        <input id={`${id}-name`} className="input" required maxLength={60} value={shoe.name} placeholder="e.g. Pegasus 41, blue" onChange={(e) => setShoe({ ...shoe, name: e.target.value })} />
      </label>
      <div className="shoe-form-numbers">
        <label className="field" htmlFor={`${id}-start`}>
          <span className="field-label">Already run (km)</span>
          <input id={`${id}-start`} className="input" type="number" inputMode="decimal" min={0} max={5000} step={0.1} value={shoe.startingKm}
            onChange={(e) => setShoe({ ...shoe, startingKm: Number(e.target.value) })} />
        </label>
        <label className="field" htmlFor={`${id}-limit`}>
          <span className="field-label">Replace at (km)</span>
          <input id={`${id}-limit`} className="input" type="number" inputMode="numeric" min={100} max={3000} step={10} value={shoe.limitKm}
            onChange={(e) => setShoe({ ...shoe, limitKm: Number(e.target.value) })} />
        </label>
      </div>
      <label className="session-done">
        <input type="checkbox" checked={shoe.isDefault ?? false} disabled={shoe.retired ?? false} onChange={(e) => setShoe({ ...shoe, isDefault: e.target.checked })} />
        Put new runs on this pair automatically
      </label>
      <label className="session-done">
        <input type="checkbox" checked={shoe.remindAtLimit ?? true} onChange={(e) => setShoe({ ...shoe, remindAtLimit: e.target.checked })} />
        Remind me when it reaches its limit
      </label>
      <div className="submit-row">
        <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

/**
 * The runner's shoes: each pair's distance (what it had run when added, plus the runs worn in it), how close it is to
 * the limit the runner set, and a way to put past runs on a pair. Distances are worked out from the runs themselves,
 * so deleting a run takes it off its pair.
 */
export function ShoeTracker({ units }: { units: Units }) {
  const auth = useAuth()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [unworn, setUnworn] = useState<UnwornRun[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState<string>('')

  const load = useCallback(() => {
    let cancelled = false
    auth.getToken()
      .then((token) => (token ? api.me.shoes(token) : Promise.reject(new Error('Sign in to see your shoes.'))))
      .then((shoes) => {
        if (!Array.isArray(shoes)) throw new Error('Your shoes aren’t available right now.')
        if (!cancelled) setState({ kind: 'ready', shoes })
      })
      .catch((error: unknown) => !cancelled && setState({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' }))
    return () => {
      cancelled = true
    }
  }, [auth])

  useEffect(() => load(), [load])

  const run = async (work: (token: string) => Promise<string>) => {
    setBusy(true)
    setMessage(null)
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Sign in again to carry on.')
      setMessage({ text: await work(token) })
      load()
      return true
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'That didn’t work. Try again.', error: true })
      return false
    } finally {
      setBusy(false)
    }
  }

  const loadUnworn = () =>
    run(async (token) => {
      setUnworn(await api.me.unwornRuns(token))
      setPicked(new Set())
      return 'Pick the runs you wore this pair for.'
    })

  const shoes = state.kind === 'ready' ? state.shoes : []
  const active = shoes.filter((s) => !s.retired)
  const keyOf = (r: UnwornRun) => r.activityId ?? r.checkInId ?? ''

  return (
    <section className="shoes" aria-labelledby="shoes-title">
      <h3 id="shoes-title">Your shoes</h3>
      <p className="field-help">
        Each pair’s distance is what it had run when you added it, plus every run you wore it for. Delete a run and it comes off its pair.
      </p>

      {state.kind === 'loading' && <p className="field-help" role="status">Loading your shoes…</p>}
      {state.kind === 'error' && (
        <div className="error-panel" role="alert">
          <p>{state.message}</p>
          <button type="button" className="button button-quiet" onClick={() => { setState({ kind: 'loading' }); load() }}>Try again</button>
        </div>
      )}

      {state.kind === 'ready' && shoes.length === 0 && editing !== 'new' && <p className="field-help">No shoes yet. Add a pair to start counting its kilometres.</p>}

      <ul className="shoe-list">
        {shoes.map((shoe) => {
          const share = Math.min(1, shoe.totalKm / shoe.limitKm)
          const wear = WEAR_WORDS[shoe.wear]
          return (
            <li key={shoe.id} className="shoe" data-wear={shoe.wear} data-retired={shoe.retired || undefined}>
              {editing === shoe.id ? (
                <ShoeForm initial={toRequest(shoe)} submitLabel="Save changes" busy={busy} onCancel={() => setEditing(null)}
                  onSubmit={(changes) => void run(async (token) => {
                    await api.me.updateShoe(token, shoe.id, changes)
                    setEditing(null)
                    return `Saved ${changes.name}.`
                  })} />
              ) : (
                <>
                  <p className="shoe-name">
                    <strong>{shoe.name}</strong>
                    {shoe.isDefault && <span className="tag">New runs</span>}
                    {shoe.retired && <span className="tag">Retired</span>}
                  </p>
                  <p className="shoe-distance">
                    <span className="mono">{formatDistance(shoe.totalKm, units)}</span> of {formatDistance(shoe.limitKm, units)}
                    {' · '}{shoe.runs} {shoe.runs === 1 ? 'run' : 'runs'}
                    {shoe.lastRunOn ? ` · last ${formatDate(shoe.lastRunOn, 'dayMonth')}` : ''}
                  </p>
                  <div className="meter shoe-meter" role="meter" aria-label={`${shoe.name}: distance towards its limit`}
                    aria-valuemin={0} aria-valuemax={shoe.limitKm} aria-valuenow={Math.round(shoe.totalKm)}
                    aria-valuetext={`${formatDistance(shoe.totalKm, units)} of ${formatDistance(shoe.limitKm, units)}`}>
                    <div className="meter-fill" style={{ width: `${share * 100}%` }} />
                  </div>
                  {wear && <p className="shoe-wear">{wear}</p>}
                  {shoe.stravaKm > 0 && (
                    <p className="field-help">Includes {formatDistance(shoe.stravaKm, units)} from Strava runs, which count while Taperday holds them (Strava’s 7-day rule). Upload the files to keep them for good.</p>
                  )}
                  <div className="shoe-actions">
                    <button type="button" className="button button-quiet" disabled={busy} onClick={() => setEditing(shoe.id)}>Edit</button>
                    <button type="button" className="button button-quiet" disabled={busy}
                      onClick={() => void run(async (token) => {
                        await api.me.updateShoe(token, shoe.id, toRequest(shoe, { retired: !shoe.retired, isDefault: false }))
                        return shoe.retired ? `${shoe.name} are back in use.` : `${shoe.name} retired. Their runs stay in your history.`
                      })}>
                      {shoe.retired ? 'Bring back' : 'Retire'}
                    </button>
                    <button type="button" className="button button-quiet" disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`Delete ${shoe.name}? Your runs stay; they just won’t be on any pair.`)) return
                        void run(async (token) => {
                          await api.me.deleteShoe(token, shoe.id)
                          return `Deleted ${shoe.name}.`
                        })
                      }}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>

      {editing === 'new' ? (
        <ShoeForm initial={{ ...blank, isDefault: active.length === 0 }} submitLabel="Add pair" busy={busy} onCancel={() => setEditing(null)}
          onSubmit={(shoe) => void run(async (token) => {
            await api.me.createShoe(token, shoe)
            setEditing(null)
            return `Added ${shoe.name}.`
          })} />
      ) : (
        state.kind === 'ready' && <button type="button" className="button button-quiet" onClick={() => setEditing('new')}>Add a pair</button>
      )}

      {active.length > 0 && (
        <details className="disclosure shoe-past" onToggle={(event) => event.currentTarget.open && unworn === null && void loadUnworn()}>
          <summary>Add past runs to a pair</summary>
          {unworn !== null && (unworn.length === 0 ? (
            <p className="field-help">Every run from the last 90 days is already on a pair.</p>
          ) : (
            <form onSubmit={(event) => {
              event.preventDefault()
              const chosen = unworn.filter((r) => picked.has(keyOf(r)))
              const shoe = target || active[0]!.id
              void run(async (token) => {
                const { added } = await api.me.addRunsToShoe(token, shoe, chosen.flatMap((r) => (r.activityId ? [r.activityId] : [])), chosen.flatMap((r) => (r.checkInId ? [r.checkInId] : [])))
                setUnworn(await api.me.unwornRuns(token))
                setPicked(new Set())
                return `Added ${added} ${added === 1 ? 'run' : 'runs'} to ${active.find((s) => s.id === shoe)?.name ?? 'the pair'}.`
              })
            }}>
              <fieldset className="shoe-runs">
                <legend className="visually-hidden">Runs without a pair</legend>
                {unworn.map((r) => (
                  <label key={keyOf(r)} className="session-done">
                    <input type="checkbox" checked={picked.has(keyOf(r))} onChange={(e) => {
                      const next = new Set(picked)
                      if (e.target.checked) next.add(keyOf(r))
                      else next.delete(keyOf(r))
                      setPicked(next)
                    }} />
                    {formatDate(r.date, 'short')} · <span className="mono">{formatDistance(r.distanceKm, units)}</span> · {r.source === 'CheckIn' ? 'checked in' : r.source === 'Strava' ? 'Strava' : 'uploaded'}
                  </label>
                ))}
              </fieldset>
              <div className="submit-row">
                <label className="field shoe-target">
                  <span className="field-label">Pair</span>
                  <select className="input" value={target || active[0]!.id} onChange={(e) => setTarget(e.target.value)}>
                    {active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <button type="submit" className="button button-primary" disabled={busy || picked.size === 0}>
                  Add {picked.size || ''} {picked.size === 1 ? 'run' : 'runs'}
                </button>
              </div>
            </form>
          ))}
        </details>
      )}

      {message && <p className={message.error ? 'field-error' : 'field-help'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    </section>
  )
}
