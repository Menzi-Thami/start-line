import { useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import type { GeneratePlanRequest } from '../../lib/types'
import type { RunnerState } from './useRunner'

interface Props {
  runner: RunnerState
  request: GeneratePlanRequest
  onOpenMyPlans: () => void
  onFinishSignUp: () => void
}

/** "Save to My plans", or whatever has to happen first: sign in, or finish signing up. */
export function SavePlanButton({ runner, request, onOpenMyPlans, onFinishSignUp }: Props) {
  const auth = useAuth()
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }>({ kind: 'idle' })

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

  if (runner.kind !== 'ready') return null

  if (status.kind === 'saved') {
    return (
      <button type="button" className="button button-quiet" onClick={onOpenMyPlans}>
        Saved. Open My plans
      </button>
    )
  }

  const save = async () => {
    setStatus({ kind: 'saving' })
    try {
      const token = await auth.getToken()
      if (!token) throw new ApiError('Your sign-in has expired. Sign in again to carry on.', 401)
      await api.me.savePlan(token, request)
      setStatus({ kind: 'saved' })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'That didn’t save. Try again.' })
    }
  }

  return (
    <>
      <button type="button" className="button button-quiet" onClick={() => void save()} disabled={status.kind === 'saving'}>
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
