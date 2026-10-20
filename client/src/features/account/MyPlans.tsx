import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate } from '../../lib/format'
import type { GeneratePlanRequest, SavedPlanSummary } from '../../lib/types'

type ListState = { kind: 'loading' } | { kind: 'ready'; plans: SavedPlanSummary[] } | { kind: 'error'; message: string }

interface Props {
  onOpen: (inputs: GeneratePlanRequest) => void
  onBuildNew: () => void
  /** A plan was made current again or deleted: the app reloads the current plan. */
  onChanged?: () => void
}

/** The runner's current plan, then their past plans (replaced by a newer one), newest first. */
export function MyPlans({ onOpen, onBuildNew, onChanged }: Props) {
  const auth = useAuth()
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Only sets state when the request settles; callers set the loading state themselves.
  const fetchPlans = useCallback(() => {
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.plans(token) : Promise.reject(new Error('Sign in to see your plans.'))))
      .then((plans) => !cancelled && setList({ kind: 'ready', plans }))
      .catch((error: unknown) => !cancelled && setList({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' }))
    return () => {
      cancelled = true
    }
  }, [auth])

  useEffect(() => fetchPlans(), [fetchPlans])

  const retry = () => {
    setList({ kind: 'loading' })
    fetchPlans()
  }

  const open = async (id: string) => {
    setBusy(id)
    setActionError(null)
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Your sign-in has expired. Sign in again to carry on.')
      onOpen((await api.me.plan(token, id)).inputs)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'That plan wouldn’t open.')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: string) => {
    setBusy(id)
    setActionError(null)
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Your sign-in has expired. Sign in again to carry on.')
      await api.me.deletePlan(token, id)
      setList((current) => (current.kind === 'ready' ? { kind: 'ready', plans: current.plans.filter((p) => p.id !== id) } : current))
      setConfirming(null)
      onChanged?.()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'That plan wasn’t deleted. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const restore = async (id: string) => {
    setBusy(id)
    setActionError(null)
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Your sign-in has expired. Sign in again to carry on.')
      await api.me.restorePlan(token, id)
      setList({ kind: 'ready', plans: await api.me.plans(token) })
      onChanged?.()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'That plan wasn’t made current. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const row = (plan: SavedPlanSummary) => (
    <li className="week saved-plan" key={plan.id}>
      <div>
        <span className="week-name">{plan.name}</span>
        <br />
        <span className="week-meta">
          {plan.raceName}
          {plan.raceDate ? ` · ${formatDate(plan.raceDate, 'long')}` : ''}
        </span>
      </div>
      <div className="saved-plan-actions">
        {confirming === plan.id ? (
          <>
            <span className="field-help">Delete this plan?</span>
            <button type="button" className="button button-danger" disabled={busy === plan.id} onClick={() => void remove(plan.id)}>
              Yes, delete
            </button>
            <button type="button" className="button button-quiet" onClick={() => setConfirming(null)}>
              Keep it
            </button>
          </>
        ) : (
          <>
            <button type="button" className="button" disabled={busy === plan.id} onClick={() => void open(plan.id)}>
              {busy === plan.id ? 'Opening…' : 'Open'}
            </button>
            {plan.status === 'Archived' && (
              <button type="button" className="button button-quiet" disabled={busy === plan.id} onClick={() => void restore(plan.id)}>
                Make this my plan again
              </button>
            )}
            <button type="button" className="button button-quiet" aria-label={`Delete ${plan.name}`} onClick={() => setConfirming(plan.id)}>
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  )

  const currentPlans = list.kind === 'ready' ? list.plans.filter((p) => p.status === 'Active') : []
  const pastPlans = list.kind === 'ready' ? list.plans.filter((p) => p.status === 'Archived') : []

  return (
    <section className="section" aria-labelledby="my-plans-title" style={{ marginTop: 0 }}>
      <h2 className="plan-title" id="my-plans-title">
        My plans
      </h2>

      {list.kind === 'loading' && (
        <div className="choice-list" aria-busy="true" style={{ marginTop: 'var(--space-4)' }}>
          {[0, 1].map((i) => (
            <div className="skeleton" key={i} aria-hidden="true" />
          ))}
          <span className="visually-hidden">Loading your plans…</span>
        </div>
      )}

      {list.kind === 'error' && (
        <div className="error-panel" role="alert" style={{ marginTop: 'var(--space-4)' }}>
          <strong>We couldn’t load your plans.</strong>
          <p>{list.message}</p>
          <button type="button" className="button button-quiet" onClick={retry} style={{ marginTop: 'var(--space-3)' }}>
            Try again
          </button>
        </div>
      )}

      {list.kind === 'ready' && list.plans.length === 0 && (
        <div className="empty" style={{ marginTop: 'var(--space-4)' }}>
          <p>No saved plans yet. Build one, then press “Save to My plans” and it’ll live here.</p>
          <button type="button" className="button" onClick={onBuildNew} style={{ marginTop: 'var(--space-3)' }}>
            Build a plan
          </button>
        </div>
      )}

      {actionError && (
        <p className="field-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
          {actionError}
        </p>
      )}

      {currentPlans.length > 0 && (
        <>
          <h3 style={{ marginTop: 'var(--space-4)' }}>Your plan</h3>
          <ul className="weeks" style={{ listStyle: 'none', padding: 0 }}>
            {currentPlans.map(row)}
          </ul>
          <p className="field-help">One plan at a time keeps your week, your runs and your progress in one place. A new plan for another race replaces this one, which moves to Past plans.</p>
        </>
      )}

      {pastPlans.length > 0 && (
        <>
          <h3 style={{ marginTop: 'var(--space-5)' }}>Past plans</h3>
          <ul className="weeks" style={{ listStyle: 'none', padding: 0 }}>
            {pastPlans.map(row)}
          </ul>
        </>
      )}
    </section>
  )
}
