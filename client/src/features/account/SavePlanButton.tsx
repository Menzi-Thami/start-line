import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import type { GeneratePlanRequest } from '../../lib/types'
import type { RunnerState } from './useRunner'

interface Props {
  runner: RunnerState
  request: GeneratePlanRequest
  onOpenMyPlans: () => void
  onFinishSignUp: () => void
  /** Save straight away: the runner signed up to build this plan, so asking again would be a chore. */
  autoSave?: boolean
}

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }

/** "Save to My plans", or whatever has to happen first: sign in, or finish signing up. */
export function SavePlanButton({ runner, request, onOpenMyPlans, onFinishSignUp, autoSave = false }: Props) {
  const auth = useAuth()
  const ready = runner.kind === 'ready'
  const [status, setStatus] = useState<Status>(() => (autoSave && ready ? { kind: 'saving' } : { kind: 'idle' }))
  // Survives StrictMode's double effect, so an automatic save never happens twice.
  const autoSaved = useRef(false)

  const persist = async () => {
    try {
      const token = await auth.getToken()
      if (!token) throw new ApiError('Your sign-in has expired. Sign in again to carry on.', 401)
      await api.me.savePlan(token, request)
      setStatus({ kind: 'saved' })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'That didn’t save. Try again.' })
    }
  }

  useEffect(() => {
    if (!autoSave || !ready || autoSaved.current) return
    autoSaved.current = true
    void persist()
    // persist is recreated each render; the ref is what stops a second save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave, ready])

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

  if (status.kind === 'saved') {
    return (
      <button type="button" className="button button-quiet" onClick={onOpenMyPlans}>
        Saved. Open My plans
      </button>
    )
  }

  const save = () => {
    setStatus({ kind: 'saving' })
    void persist()
  }

  return (
    <>
      <button type="button" className="button button-quiet" onClick={save} disabled={status.kind === 'saving'}>
        {status.kind === 'saving' ? 'Saving…' : 'Save to My plans'}
      </button>
      {status.kind === 'error' && (
        <span className="field-error" role="alert">
          {status.message}
        </span>
      )}
    </>
  )
}
