import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import type { GeneratePlanRequest } from '../../lib/types'
import { sameRace, samePlan, type CurrentPlan } from './useCurrentPlan'
import type { RunnerState } from './useRunner'

interface Props {
  runner: RunnerState
  request: GeneratePlanRequest
  onFinishSignUp: () => void
  /** The runner deleted their plan from here. */
  onDeleted?: () => void
  /** Save straight away: the runner signed up to build this plan, so asking again would be a chore. Only when they have no plan yet. */
  autoSave?: boolean
  /** The runner's current plan: null when they have none, undefined while it isn't known. */
  current?: CurrentPlan | null
  /** Called after a save, so the app can reload the current plan. */
  onSaved?: () => void
}

type Status =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'confirming-delete' }
  | { kind: 'deleting' }
  | { kind: 'error'; message: string }

/**
 * Saves the plan on screen as the runner's one plan, or says what has to happen first (sign in, finish signing up).
 * With a plan already, it asks first. On the runner's own plan it's where they delete it.
 */
export function SavePlanButton({ runner, request, onFinishSignUp, onDeleted, autoSave = false, current, onSaved }: Props) {
  const auth = useAuth()
  const ready = runner.kind === 'ready'
  const canAutoSave = autoSave && ready && current === null
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  // Survives StrictMode's double effect, so an automatic save never happens twice.
  const autoSaved = useRef(false)

  const persist = async (replaceCurrent: boolean) => {
    setStatus({ kind: 'saving' })
    try {
      const token = await auth.getToken()
      if (!token) throw new ApiError('Your sign-in has expired. Sign in again to carry on.', 401)
      await api.me.savePlan(token, request, undefined, replaceCurrent)
      setStatus({ kind: 'saved' })
      onSaved?.()
    } catch (error) {
      // The app didn't know about the runner's plan yet (it couldn't load): reload it, so the button offers to replace it.
      if (error instanceof ApiError && error.code === 'plan_active') onSaved?.()
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'That didn’t save. Try again.' })
    }
  }

  const remove = async (id: string) => {
    setStatus({ kind: 'deleting' })
    try {
      const token = await auth.getToken()
      if (!token) throw new ApiError('Your sign-in has expired. Sign in again to carry on.', 401)
      await api.me.deletePlan(token, id)
      onSaved?.()
      onDeleted?.()
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'That didn’t delete. Try again.' })
    }
  }

  useEffect(() => {
    if (!canAutoSave || autoSaved.current) return
    autoSaved.current = true
    void persist(false)
    // persist is recreated each render; the ref is what stops a second save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoSave])

  if (runner.kind === 'off') return null

  if (runner.kind === 'signed-out') {
    return (
      <button type="button" className="button button-quiet" onClick={auth.signIn}>
        Sign in to save this plan
      </button>
    )
  }

  if (runner.kind === 'needs-sign-up') {
    return (
      <button type="button" className="button button-quiet" onClick={onFinishSignUp}>
        Finish signing up to save
      </button>
    )
  }

  if (!ready) return null

  if (current && samePlan(request, current.inputs)) {
    if (status.kind === 'confirming-delete' || status.kind === 'deleting') {
      return (
        <span className="save-confirm" role="group" aria-label="Delete your plan">
          <span className="field-help">Delete this plan?</span>
          <button type="button" className="button button-danger" disabled={status.kind === 'deleting'} onClick={() => void remove(current.id)}>
            Yes, delete
          </button>
          <button type="button" className="button button-quiet" onClick={() => setStatus({ kind: 'idle' })}>
            Keep it
          </button>
        </span>
      )
    }
    return (
      <>
        <button type="button" className="button button-quiet" onClick={() => setStatus({ kind: 'confirming-delete' })}>
          Delete plan
        </button>
        {status.kind === 'error' && (
          <span className="field-error" role="alert">
            {status.message}
          </span>
        )}
      </>
    )
  }

  if (status.kind === 'saved') return <span className="chip chip-good">Saved</span>

  if (status.kind === 'confirming' && current) {
    const update = sameRace(request, current.inputs)
    return (
      <span className="save-confirm" role="group" aria-label="Replace your current plan">
        <span className="field-help">{update ? `Update ${current.name}?` : `Replace ${current.name}?`}</span>
        <button type="button" className="button" onClick={() => void persist(true)}>
          {update ? 'Yes, update it' : 'Yes, replace it'}
        </button>
        <button type="button" className="button button-quiet" onClick={() => setStatus({ kind: 'idle' })}>
          Keep my plan
        </button>
      </span>
    )
  }

  const save = () => (current ? setStatus({ kind: 'confirming' }) : void persist(false))

  return (
    <>
      <button type="button" className="button button-quiet" onClick={save} disabled={status.kind === 'saving'}>
        {status.kind === 'saving' ? 'Saving…' : current ? 'Make this my plan' : 'Save plan'}
      </button>
      {status.kind === 'error' && (
        <span className="field-error" role="alert">
          {status.message}
        </span>
      )}
    </>
  )
}
