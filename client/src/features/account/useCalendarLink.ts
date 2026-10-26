import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'

/**
 * The secret in the runner's personal calendar link, loaded (and made, the first time) once it's wanted: when their own
 * plan is on screen. It belongs to one account, so another account signed in on the same device never sees it. Until it
 * arrives, or if it can't, the calendar menu offers the plan's own links instead.
 */
export function useCalendarLink(owner: string | null, enabled: boolean) {
  const auth = useAuth()
  const [link, setLink] = useState<{ owner: string; token: string } | null>(null)
  const token = owner && link?.owner === owner ? link.token : null

  useEffect(() => {
    if (!enabled || !owner || token) return
    let cancelled = false
    auth
      .getToken()
      .then((access) => (access ? api.me.calendar(access) : null))
      .then((found) => {
        if (!cancelled && found) setLink({ owner, token: found.token })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled, owner, token, auth])

  return {
    token: enabled ? token : null,
    /** After a reset in Account: the new link, so the calendar menu never offers the one that stopped working. */
    replace: (next: string) => owner && setLink({ owner, token: next }),
  }
}
