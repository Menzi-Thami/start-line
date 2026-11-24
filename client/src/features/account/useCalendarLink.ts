import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'

/**
 * The secret in the runner's personal calendar link, loaded (and made, the first time) once it's wanted: when their own
 * plan is on screen. It belongs to one account, so another account signed in on the same device never sees it. Until it
 * arrives, or if it can't, the calendar menu offers the plan's own links instead.
 */
/** One read per account per visit: the secret only changes when the runner resets it, which goes through replace. */
let known: { owner: string; request: Promise<string | null> } | null = null
/** For tests. */
export function forgetCalendarLink() { known = null }

export function useCalendarLink(owner: string | null, enabled: boolean) {
  const auth = useAuth()
  const [link, setLink] = useState<{ owner: string; token: string } | null>(null)
  const token = owner && link?.owner === owner ? link.token : null

  useEffect(() => {
    if (!enabled || !owner || token) return
    let cancelled = false
    if (known?.owner !== owner) {
      const request = auth.getToken()
        .then((access) => (access ? api.me.calendar(access) : null))
        .then((found) => found?.token ?? null)
      // A failed read is forgotten, so the next time the plan opens asks again.
      request.then(value => { if (value === null && known?.request === request) known = null }, () => { if (known?.request === request) known = null })
      known = { owner, request }
    }
    known.request
      .then((found) => {
        if (!cancelled && found) setLink({ owner, token: found })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled, owner, token, auth])

  return {
    token: enabled ? token : null,
    /** After a reset in Account: the new link, so the calendar menu never offers the one that stopped working. */
    replace: (next: string) => {
      if (!owner) return
      known = { owner, request: Promise.resolve(next) }
      setLink({ owner, token: next })
    },
  }
}
