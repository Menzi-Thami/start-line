import { toTimeSpan } from './format'
import type {
  AcceptPrivacyRequest,
  Activity,
  ActivitySummary,
  BulkImport,
  CalendarLink,
  CoachingProposal,
  RemainingWeekProposal,
  RecoveryReadiness,
  Feeling,
  LifeChange,
  LifeProposal,
  ProgressStory,
  Readiness,
  SleepQuality,
  Soreness,
  TrainingInsights,
  SyncedCompletion,
  CheckIn,
  CheckInRequest,
  GeneratePlanRequest,
  LoggedRun,
  PersonalBest,
  Prediction,
  Race,
  RunData,
  SaveShoe,
  Shoe,
  UnwornRun,
  ReminderDevice,
  Reminders,
  Runner,
  SavedPlan,
  SavedPlanSummary,
  SaveProfileRequest,
  Setback,
  StravaDisconnected,
  StravaStatus,
  TrainingPlan,
  TurnOnRemindersRequest,
} from './types'

/** The one place the app talks to the network. Every failure becomes an ApiError with words a runner can act on. */
export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string[]>
  /** The API's stable error code, e.g. registration_required or plan_limit. */
  readonly code: string | undefined

  constructor(message: string, status: number, fieldErrors: Record<string, string[]> = {}, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
    this.code = code
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

/** The API's origin, for links that leave the app (calendar subscriptions). In development it sits behind the dev server. */
export const apiOrigin = (): string => BASE_URL || window.location.origin

interface Problem {
  code?: string
  title?: string | null
  detail?: string | null
  errors?: Record<string, string[]>
}

/** A read that hasn't answered in this long won't: the free server wakes within a minute. */
export const READ_TIMEOUT_MS = 60_000

/** Before the one retry of a read that met a sleeping or restarting server. */
export const RETRY_AFTER_MS = import.meta.env.MODE === 'test' ? 0 : 2_000

/**
 * Starts waking the API the moment the page loads, so it's warming up while the runner signs in. Fire and forget: the
 * answer isn't read (no-cors), and a failure changes nothing.
 */
export function wakeApi(): void {
  if (!BASE_URL) return
  fetch(`${BASE_URL}/health/live`, { mode: 'no-cors', cache: 'no-store' }).catch(() => undefined)
}

/**
 * Whether the API is answering (`live`: the server alone, never the database) or ready (`ready`: its database too).
 * Only ever a hint for the waiting screen, so any failure is simply "not yet".
 */
export async function isUp(check: 'live' | 'ready'): Promise<boolean> {
  try {
    const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(READ_TIMEOUT_MS) : undefined
    return (await fetch(`${BASE_URL}/health/${check}`, { cache: 'no-store', signal })).ok
  } catch {
    return false
  }
}

const isRead = (init: RequestInit) => !init.method || init.method === 'GET'

function withTimeout(init: RequestInit): AbortSignal | undefined {
  if (!isRead(init) || typeof AbortSignal.timeout !== 'function') return init.signal ?? undefined
  const timeout = AbortSignal.timeout(READ_TIMEOUT_MS)
  if (!init.signal) return timeout
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([init.signal, timeout]) : init.signal
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  try {
    return await attempt<T>(path, init, token)
  } catch (error) {
    // A sleeping or restarting server answers reads with a dropped connection or a 502/503/504: try once more.
    const retryable = error instanceof ApiError && (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504)
    if (!retryable || !isRead(init) || init.signal?.aborted) throw error
    await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS))
    return attempt<T>(path, init, token)
  }
}

async function attempt<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: withTimeout(init),
      headers: {
        Accept: 'application/json',
        // A FormData body sets its own multipart Content-Type, boundary included.
        ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError("We couldn't reach Taperday. It may still be waking up: try again in a moment, or check your connection.", 0)
  }

  if (response.status === 204) {
    return undefined as T
  }

  if (response.ok) {
    return (await response.json()) as T
  }

  if (response.status === 401) {
    throw new ApiError('Your sign-in has expired. Sign in again to carry on.', 401)
  }

  if (response.status === 429) {
    const wait = Number(response.headers.get('Retry-After'))
    throw new ApiError(
      `That's a lot in a short time. Try again in ${Number.isFinite(wait) && wait > 0 ? `${wait} seconds` : 'a minute'}.`,
      429,
    )
  }

  let problem: Problem = {}
  try {
    problem = (await response.json()) as Problem
  } catch {
    // Not a ProblemDetails body; fall through to the generic message.
  }

  if (response.status >= 500) {
    throw new ApiError('Something went wrong on our side. Please try again in a moment.', response.status)
  }

  throw new ApiError(problem.detail ?? problem.title ?? 'That request didn’t work.', response.status, problem.errors ?? {}, problem.code)
}


export const api = {
  races: (signal?: AbortSignal) => request<Race[]>('/api/v1/races', { signal }),

  plan: (body: GeneratePlanRequest, signal?: AbortSignal) =>
    request<TrainingPlan>('/api/v1/plans', { method: 'POST', body: JSON.stringify(body), signal }),

  predict: (fromKm: number, seconds: number, toKm: number, signal?: AbortSignal) => {
    const query = new URLSearchParams({ fromKm: String(fromKm), time: toTimeSpan(seconds), toKm: String(toKm) })
    return request<Prediction>(`/api/v1/predictions?${query}`, { signal })
  },

  /** Stops Taperday's news and update emails, with the key from an email's unsubscribe link. No sign-in: the key is enough. */
  unsubscribe: (token: string) =>
    request<void>('/api/v1/unsubscribe', { method: 'POST', body: JSON.stringify({ token }) }),

  // Signed-in calls take the access token explicitly, so this module never holds sign-in state.
  me: {
    get: (token: string) => request<Runner>('/api/v1/me', {}, token),
    save: (token: string, body: SaveProfileRequest) =>
      request<Runner>('/api/v1/me', { method: 'PUT', body: JSON.stringify(body) }, token),
    acceptPrivacy: (token: string, body: AcceptPrivacyRequest) =>
      request<Runner>('/api/v1/me/privacy', { method: 'PUT', body: JSON.stringify(body) }, token),
    exportData: (token: string) => request<unknown>('/api/v1/me/export', {}, token),
    remove: (token: string) => request<void>('/api/v1/me', { method: 'DELETE' }, token),
    /** The secret for the runner's personal calendar feed, made the first time it's asked for. */
    calendar: (token: string) => request<CalendarLink>('/api/v1/me/calendar', {}, token),
    /** A new calendar secret: the old link stops working. */
    resetCalendar: (token: string) => request<CalendarLink>('/api/v1/me/calendar/reset', { method: 'POST' }, token),
    /** The runner's own picture as a data URL, or undefined when they haven't added one (the app shows their initials). */
    photo: (token: string) => request<{ dataUrl: string } | undefined>('/api/v1/me/photo', {}, token),
    /** Adds or replaces the runner's picture: a small JPEG data URL, already shrunk on the device. */
    setPhoto: (token: string, dataUrl: string) =>
      request<{ dataUrl: string }>('/api/v1/me/photo', { method: 'PUT', body: JSON.stringify({ dataUrl }) }, token),
    removePhoto: (token: string) => request<void>('/api/v1/me/photo', { method: 'DELETE' }, token),
    plans: (token: string) => request<SavedPlanSummary[]>('/api/v1/me/plans', {}, token),
    plan: (token: string, id: string) => request<SavedPlan>(`/api/v1/me/plans/${encodeURIComponent(id)}`, {}, token),
    /** Saves as the runner's current plan. With a plan already, replaceCurrent must be true (the API answers 409 plan_active otherwise). */
    savePlan: (token: string, plan: GeneratePlanRequest, name?: string, replaceCurrent = false, expectedPlanId?: string, signal?: AbortSignal) =>
      request<SavedPlanSummary>('/api/v1/me/plans', { method: 'POST', body: JSON.stringify({ name: name ?? null, plan, replaceCurrent, expectedPlanId }), signal }, token),
    /**
     * Opens the saved plan with accepted coaching calls. New suggestions are previewed and applied separately.
     */
    coachPlan: (token: string, id: string) =>
      request<SavedPlan>(`/api/v1/me/plans/${encodeURIComponent(id)}/coach`, { method: 'POST' }, token),
    reviewCoaching: (token: string, id: string, recovery: RecoveryReadiness = 'NotReported') => request<CoachingProposal>(`/api/v1/me/plans/${encodeURIComponent(id)}/coach/proposal?recovery=${encodeURIComponent(recovery)}`, {}, token),
    applyCoaching: (token: string, id: string, proposalToken: string, recovery: RecoveryReadiness = 'NotReported') => request<CoachingProposal>(`/api/v1/me/plans/${encodeURIComponent(id)}/coach/apply`, { method: 'POST', body: JSON.stringify({ token: proposalToken, recovery }) }, token),
    /** Declines the reviewed suggestion: nothing changes, and the answer goes into the coaching history. */
    declineCoaching: (token: string, id: string, proposalToken: string, recovery: RecoveryReadiness = 'NotReported') => request<CoachingProposal>(`/api/v1/me/plans/${encodeURIComponent(id)}/coach/decline`, { method: 'POST', body: JSON.stringify({ token: proposalToken, recovery }) }, token),
    /** Load, consistency and easy-pace trends on a saved plan, worked out on each read, and the coaching history. */
    trainingInsights: (token: string, id: string) => request<TrainingInsights>(`/api/v1/me/plans/${encodeURIComponent(id)}/insights`, { cache: 'no-store' }, token),
    /** Planned sessions a held Strava run completes, worked out on each read and never stored. */
    stravaCompletions: (token: string, id: string) => request<SyncedCompletion[]>(`/api/v1/me/plans/${encodeURIComponent(id)}/strava-completions`, { cache: 'no-store' }, token),
    /** How the runner has progressed over the last 4, 8 or 12 weeks against the same span before. */
    progressStory: (token: string, id: string, weeks: 4 | 8 | 12) => request<ProgressStory>(`/api/v1/me/plans/${encodeURIComponent(id)}/progress?weeks=${weeks}`, { cache: 'no-store' }, token),
    /** The runner's daily readiness check-ins, newest first (today and up to 13 days before). */
    readiness: (token: string) => request<Readiness[]>('/api/v1/me/readiness', { cache: 'no-store' }, token),
    /** Logs or changes how the runner felt on a day. */
    logReadiness: (token: string, date: string, body: { feeling: Feeling; sleep?: SleepQuality | null; soreness?: Soreness | null; note?: string | null }) => request<Readiness>(`/api/v1/me/readiness/${encodeURIComponent(date)}`, { method: 'PUT', body: JSON.stringify(body) }, token),
    /** Clears a day's check-in. */
    clearReadiness: (token: string, date: string) => request<void>(`/api/v1/me/readiness/${encodeURIComponent(date)}`, { method: 'DELETE' }, token),
    reviewRemainingWeek: (token: string, id: string) => request<RemainingWeekProposal>(`/api/v1/me/plans/${encodeURIComponent(id)}/remaining-week/proposal`, {}, token),
    applyRemainingWeek: (token: string, id: string, proposalToken: string) => request<RemainingWeekProposal>(`/api/v1/me/plans/${encodeURIComponent(id)}/remaining-week/apply`, { method: 'POST', body: JSON.stringify({ token: proposalToken }) }, token),
    /** Previews what a situation (missed run, short day, travel, illness, moving the long run) would change. */
    previewLifeChange: (token: string, id: string, change: LifeChange) => request<LifeProposal>(`/api/v1/me/plans/${encodeURIComponent(id)}/life-happens/preview`, { method: 'POST', body: JSON.stringify(change) }, token),
    /** Applies exactly the previewed change. */
    applyLifeChange: (token: string, id: string, change: LifeChange, proposalToken: string) => request<LifeProposal>(`/api/v1/me/plans/${encodeURIComponent(id)}/life-happens/apply`, { method: 'POST', body: JSON.stringify({ change, token: proposalToken }) }, token),
    /** Puts upcoming days back as the plan first wrote them. */
    restoreSessions: (token: string, id: string, dates: string[]) => request<SavedPlan>(`/api/v1/me/plans/${encodeURIComponent(id)}/adjustments/restore`, { method: 'POST', body: JSON.stringify({ dates }) }, token),
    /** The runner's check-ins on one saved plan: how each run went. */
    checkIns: (token: string, planId: string) => request<CheckIn[]>(`/api/v1/me/plans/${encodeURIComponent(planId)}/check-ins`, {}, token),
    /** Saves (or replaces) the check-in for the run planned on that day. */
    saveCheckIn: (token: string, planId: string, date: string, sessionType: string, body: CheckInRequest) =>
      request<CheckIn>(
        `/api/v1/me/plans/${encodeURIComponent(planId)}/check-ins/${encodeURIComponent(date)}/${encodeURIComponent(sessionType)}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    saveAdditionalRun: (token: string, planId: string, id: string, date: string, sessionType: string, body: CheckInRequest) =>
      request<CheckIn>(`/api/v1/me/plans/${encodeURIComponent(planId)}/check-ins/additional/${encodeURIComponent(id)}/${encodeURIComponent(date)}/${encodeURIComponent(sessionType)}`,
        { method: 'PUT', body: JSON.stringify(body) }, token),
    deleteAdditionalRun: (token: string, planId: string, id: string) =>
      request<void>(`/api/v1/me/plans/${encodeURIComponent(planId)}/check-ins/additional/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),
    deleteCheckIn: (token: string, planId: string, date: string, sessionType: string) =>
      request<void>(
        `/api/v1/me/plans/${encodeURIComponent(planId)}/check-ins/${encodeURIComponent(date)}/${encodeURIComponent(sessionType)}`,
        { method: 'DELETE' },
        token,
      ),
    /** "Replan from here" for a saved plan: rebuilt from replanFrom after a setback. A second replan replaces the first. */
    replanPlan: (token: string, id: string, replan: { replanFrom: string; setback: Setback; recentWeeklyKm: number | null }) =>
      request<SavedPlan>(`/api/v1/me/plans/${encodeURIComponent(id)}/replan`, { method: 'POST', body: JSON.stringify(replan) }, token),
    /** Undoes the replan: the saved plan is back as first built. */
    undoReplan: (token: string, id: string) =>
      request<SavedPlan>(`/api/v1/me/plans/${encodeURIComponent(id)}/replan`, { method: 'DELETE' }, token),
    /** Makes a past plan current again; the current one becomes a past plan. */
    restorePlan: (token: string, id: string) =>
      request<SavedPlanSummary>(`/api/v1/me/plans/${encodeURIComponent(id)}/restore`, { method: 'POST' }, token),
    deletePlan: (token: string, id: string) =>
      request<void>(`/api/v1/me/plans/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),
    activities: (token: string) => request<ActivitySummary[]>('/api/v1/me/activities', {}, token),
    activity: (token: string, id: string) => request<Activity>(`/api/v1/me/activities/${encodeURIComponent(id)}`, {}, token),
    // Several .fit files in one request: the browser has already unzipped them, the server reads them.
    uploadActivities: (token: string, files: readonly File[], signal?: AbortSignal) => {
      const body = new FormData()
      for (const file of files) body.append('files', file, file.name)
      return request<BulkImport>('/api/v1/me/activities/batch', { method: 'POST', body, signal }, token)
    },
    deleteActivity: (token: string, id: string) =>
      request<void>(`/api/v1/me/activities/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),
    bests: (token: string) => request<PersonalBest[]>('/api/v1/me/activities/bests', {}, token),
    /** Where the runner's runs came from, what makes up this week's and month's totals, duplicates, gaps and sync problems. */
    runData: (token: string) => request<RunData>('/api/v1/me/run-data', { cache: 'no-store' }, token),
    shoes: (token: string) => request<Shoe[]>('/api/v1/me/shoes', { cache: 'no-store' }, token),
    createShoe: (token: string, shoe: SaveShoe) => request<Shoe>('/api/v1/me/shoes', { method: 'POST', body: JSON.stringify(shoe) }, token),
    updateShoe: (token: string, id: string, shoe: SaveShoe) =>
      request<Shoe>(`/api/v1/me/shoes/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(shoe) }, token),
    deleteShoe: (token: string, id: string) => request<void>(`/api/v1/me/shoes/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),
    /** Puts one run (or a check-in with a distance) on a pair; no pair takes it off. */
    wearShoe: (token: string, shoeId: string | null, run: { activityId?: string; checkInId?: string }) =>
      request<void>('/api/v1/me/shoes/worn', { method: 'PUT', body: JSON.stringify({ shoeId, ...run }) }, token),
    addRunsToShoe: (token: string, id: string, activityIds: readonly string[], checkInIds: readonly string[]) =>
      request<{ added: number }>(`/api/v1/me/shoes/${encodeURIComponent(id)}/runs`, { method: 'POST', body: JSON.stringify({ activityIds, checkInIds }) }, token),
    unwornRuns: (token: string) => request<UnwornRun[]>('/api/v1/me/shoes/unworn-runs', { cache: 'no-store' }, token),
    retryStrava: (token: string) => request<{ retried: number }>('/api/v1/me/run-data/retry-strava', { method: 'POST' }, token),
    deleteActivities: (token: string, activityIds: readonly string[]) =>
      request<{ deleted: number }>('/api/v1/me/run-data/delete', { method: 'POST', body: JSON.stringify({ activityIds }) }, token),
    /** Every run as a CSV file (not JSON, so it skips the JSON request helper). */
    exportRuns: async (token: string): Promise<Blob> => {
      const response = await fetch(`${BASE_URL}/api/v1/me/run-data/export.csv`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      if (!response.ok) throw new ApiError(response.status === 401 ? 'Your sign-in has expired. Sign in again to carry on.' : 'The download didn’t work. Try again in a moment.', response.status)
      return response.blob()
    },
    /** The runs behind the long-term totals: sessions ticked off (at the plan's distance) and uploads, plus Strava's current copies when asked. */
    running: (token: string, includeSynced = false) => request<LoggedRun[]>(`/api/v1/me/running${includeSynced ? '?includeSynced=true' : ''}`, { cache: 'no-store' }, token),
    /** Every kept run since the runner started (uploads and ticks), for the all-time totals. */
    allTimeRunning: (token: string) => request<LoggedRun[]>('/api/v1/me/running?allTime=true', { cache: 'no-store' }, token),
    sendFeedback: (token: string, message: string, page: string) =>
      request<void>('/api/v1/me/feedback', { method: 'POST', body: JSON.stringify({ message, page }) }, token),
    reminders: {
      get: (token: string) => request<Reminders>('/api/v1/me/reminders', {}, token),
      turnOn: (token: string, body: TurnOnRemindersRequest) =>
        request<ReminderDevice>('/api/v1/me/reminders/devices', { method: 'PUT', body: JSON.stringify(body) }, token),
      turnOff: (token: string, id: string) =>
        request<void>(`/api/v1/me/reminders/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),
    },
    strava: {
      status: (token: string) => request<StravaStatus>('/api/v1/me/sync/strava', {}, token),
      /** Where to send the runner to approve Taperday on Strava. */
      authorize: (token: string) => request<{ authorizeUrl: string }>('/api/v1/me/sync/strava/authorize', { method: 'POST' }, token),
      connect: (token: string, body: { code: string; state: string; scope: string | null }) =>
        request<StravaStatus>('/api/v1/me/sync/strava', { method: 'POST', body: JSON.stringify(body) }, token),
      catchUp: (token: string) => request<StravaStatus>('/api/v1/me/sync/strava/catch-up', { method: 'POST' }, token),
      disconnect: (token: string) => request<StravaDisconnected>('/api/v1/me/sync/strava', { method: 'DELETE' }, token),
    },
  },
}
