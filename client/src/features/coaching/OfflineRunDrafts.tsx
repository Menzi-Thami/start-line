import { useCallback, useSyncExternalStore } from 'react'
import { useAuth } from '../../app/auth-context'
import { readCheckInCopies, subscribeCheckInCopies } from './check-in-storage'
import { CheckInLoadState } from './CheckInLoadState'
import { useCheckIns } from './useCheckIns'

function PlanDrafts({ planId }: { planId: string }) {
  const checkIns = useCheckIns(planId)
  return checkIns.pending.length ? <CheckInLoadState {...checkIns} /> : null
}

/** A replaced, removed or temporarily unavailable current plan must not strand that plan's unsent answers. */
export function OfflineRunDrafts({ activePlanId }: { activePlanId: string | null | undefined }) {
  const owner = useAuth().account?.id ?? null
  const snapshot = useCallback(() => readCheckInCopies(owner), [owner])
  const copies = useSyncExternalStore(subscribeCheckInCopies, snapshot)
  const pending = Object.entries(copies).filter(([id, copy]) => id !== activePlanId && copy.pending?.length > 0)
  if (!owner || pending.length === 0) return null
  return <section className="panel" aria-label="Device drafts from other plans">
    <h2>Runs still on this device</h2>
    <p>These drafts belong to another plan. Replacing or removing a plan does not discard them. Review a draft before choosing which entry to keep.</p>
    {pending.map(([id]) => <PlanDrafts key={`${owner}:${id}`} planId={id} />)}
  </section>
}
