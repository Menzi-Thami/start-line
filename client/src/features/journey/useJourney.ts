import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth, type Auth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { isJourneyPayload } from './journey-model'
import type {
  ChangeRecovery,
  Journey,
  RaceResult,
  RecoveryCheckInRequest,
  RecoveryPlan,
  SaveRaceResult,
  StartMaintenance,
  StartRecovery,
} from './types'

/** Every open screen reloads its journey when another one changes it (Home and the plan can both show recovery). */
const CHANGED = 'taperday:journey-changed'

export type JourneyState =
  | { kind: 'off' }
  | { kind: 'loading' }
  | { kind: 'ready'; journey: Journey; refreshFailed: boolean }
  | { kind: 'error'; message: string }

export interface JourneyActions {
  refresh: () => void
  celebrated: (achievementId: string) => Promise<void>
  saveRaceResult: (planId: string, body: SaveRaceResult) => Promise<RaceResult>
  deleteRaceResult: (planId: string) => Promise<void>
  startRecovery: (body: StartRecovery) => Promise<RecoveryPlan>
  changeRecovery: (id: string, body: ChangeRecovery) => Promise<RecoveryPlan>
  checkIn: (id: string, body: RecoveryCheckInRequest) => Promise<RecoveryPlan>
  startMaintenance: (body: StartMaintenance) => Promise<void>
  endMaintenance: () => Promise<void>
}

/**
 * The signed-in runner's journey. A failed refresh keeps what was already on screen (never an empty history), late
 * answers from an older request are dropped, and every change reloads the journey so awards and lifecycle are always
 * the server's, not a guess made here.
 */
export function useJourney(enabled: boolean): { state: JourneyState; actions: JourneyActions } {
  const auth = useAuth()
  const [loaded, setState] = useState<JourneyState & { owner: Auth }>({ kind: 'loading', owner: auth })
  const state: JourneyState = loaded.owner === auth ? loaded : { kind: 'loading' }
  const sequence = useRef(0)
  const owner = useRef(0)

  const load = useCallback(() => {
    const mine = ++sequence.current
    auth.getToken()
      .then(token => (token ? api.me.journey.get(token) : Promise.reject(new Error('Sign in again to see your running journey.'))))
      .then(journey => {
        if (mine !== sequence.current) return
        if (!isJourneyPayload(journey)) throw new Error('Your running journey returned an unexpected response. Try again.')
        setState({ kind: 'ready', journey, refreshFailed: false, owner: auth })
      })
      .catch((error: unknown) => {
        if (mine !== sequence.current) return
        const message = error instanceof Error ? error.message : 'Your running journey couldn’t load.'
        setState(previous => previous.owner === auth && previous.kind === 'ready' ? { ...previous, refreshFailed: true } : { kind: 'error', message, owner: auth })
      })
  }, [auth])

  useEffect(() => {
    if (!enabled) return
    const requests = sequence
    const identity = owner
    load()
    window.addEventListener(CHANGED, load)
    return () => {
      window.removeEventListener(CHANGED, load)
      // An answer arriving after this screen has gone is dropped.
      requests.current++
      identity.current++
    }
  }, [enabled, load])

  const withToken = useCallback(async <T,>(run: (token: string) => Promise<T>, apply?: (journey: Journey, result: T) => Journey): Promise<T> => {
    const mine = owner.current
    const token = await auth.getToken()
    if (mine !== owner.current) throw new Error('Your account changed. Open this journey again before saving.')
    if (!token) throw new Error('Sign in again to save this.')
    const result = await run(token)
    if (mine !== owner.current) return result
    // The write succeeded even if its following refresh fails. Keep its confirmed result visible and invalidate
    // earlier reads; achievements and lifecycle are still refreshed from the server, never invented here.
    sequence.current++
    if (apply) setState(previous => previous.owner === auth && previous.kind === 'ready' ? { ...previous, journey: apply(previous.journey, result) } : previous)
    window.dispatchEvent(new Event(CHANGED))
    return result
  }, [auth])

  const actions: JourneyActions = {
    refresh: load,
    celebrated: async (id) => {
      // Marked without a reload: the film has already been seen, and a failure here only means it may play once more.
      const token = await auth.getToken()
      if (token) await api.me.journey.celebrated(token, id)
    },
    saveRaceResult: (planId, body) => withToken(token => api.me.journey.saveRaceResult(token, planId, body), (journey, result) => ({ ...journey,
      chapters: journey.chapters.map(chapter => chapter.planId === planId ? { ...chapter, raceResult: result,
        achievements: chapter.achievements.filter(a => a.kind !== 'RaceFinished' || result.outcome === 'Finished') } : chapter),
    })),
    deleteRaceResult: (planId) => withToken(token => api.me.journey.deleteRaceResult(token, planId), journey => ({ ...journey,
      chapters: journey.chapters.map(chapter => chapter.planId === planId ? { ...chapter, raceResult: null,
        achievements: chapter.achievements.filter(a => a.kind !== 'RaceFinished') } : chapter),
    })),
    startRecovery: (body) => withToken(token => api.me.journey.startRecovery(token, body), (journey, recovery) => ({ ...journey, recovery })),
    changeRecovery: (id, body) => withToken(token => api.me.journey.changeRecovery(token, id, body), (journey, recovery) => ({ ...journey, recovery })),
    checkIn: (id, body) => withToken(token => api.me.journey.checkIn(token, id, body), (journey, recovery) => ({ ...journey, recovery })),
    startMaintenance: async (body) => { await withToken(token => api.me.journey.startMaintenance(token, body)) },
    endMaintenance: () => withToken(token => api.me.journey.endMaintenance(token)),
  }
  return { state: enabled ? state : { kind: 'off' }, actions }
}
