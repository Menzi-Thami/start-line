import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth, type Auth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { RaceHistory, RaceMemory, SaveRaceMemory } from './types'
import { JOURNEY_CHANGED } from './useJourney'

export type RaceHistoryState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; history: RaceHistory; refreshFailed: boolean }

export function useRaceHistory() {
  const auth = useAuth()
  const [loaded, setLoaded] = useState<RaceHistoryState & { owner: Auth }>({ kind: 'loading', owner: auth })
  const state: RaceHistoryState = loaded.owner === auth ? loaded : { kind: 'loading' }
  const sequence = useRef(0)
  const identity = useRef(0)
  const refresh = useCallback(() => {
    const mine = ++sequence.current
    auth.getToken().then(token => {
      if (!token) throw new Error('Sign in again to see your race history.')
      return api.me.journey.races(token)
    }).then(history => {
      if (mine !== sequence.current) return
      if (!history || !Array.isArray(history.races) || !Array.isArray(history.majors)) throw new Error('Your races returned an unexpected response. Try again.')
      setLoaded({ kind: 'ready', history, refreshFailed: false, owner: auth })
    }).catch((reason: unknown) => {
      if (mine !== sequence.current) return
      setLoaded(previous => previous.owner === auth && previous.kind === 'ready' ? { ...previous, refreshFailed: true }
        : { kind: 'error', message: reason instanceof Error ? reason.message : 'Your races couldn’t load.', owner: auth })
    })
  }, [auth])
  useEffect(() => {
    const requests = sequence
    const owner = identity
    refresh()
    window.addEventListener(JOURNEY_CHANGED, refresh)
    return () => { requests.current++; owner.current++; window.removeEventListener(JOURNEY_CHANGED, refresh) }
  }, [refresh])

  const mutate = async <T,>(run: (token: string) => Promise<T>, apply: (history: RaceHistory, result: T) => RaceHistory): Promise<T> => {
    const mine = identity.current
    const token = await auth.getToken()
    if (mine !== identity.current) throw new Error('Your account changed. Open your journey again before saving.')
    if (!token) throw new Error('Sign in again to save your race.')
    const result = await run(token)
    if (mine !== identity.current) return result
    sequence.current++
    setLoaded(previous => previous.owner === auth && previous.kind === 'ready' ? { ...previous, history: apply(previous.history, result) } : previous)
    window.dispatchEvent(new Event(JOURNEY_CHANGED))
    return result
  }
  return {
    state, refresh,
    save: (id: string, body: SaveRaceMemory) => mutate(token => api.me.journey.saveRace(token, id, body), (history, memory) => ({ ...history,
      races: [...history.races.filter(race => race.result.id !== memory.result.id), memory].sort((a, b) => b.result.raceDate.localeCompare(a.result.raceDate)),
    })),
    remove: (memory: RaceMemory) => mutate(token => api.me.journey.deleteRace(token, memory.result.id, memory.result.version), history => ({ ...history,
      races: history.races.filter(race => race.result.id !== memory.result.id),
    })),
  }
}

export type RaceHistoryStore = ReturnType<typeof useRaceHistory>
