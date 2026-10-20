import { toTimeSpan } from './format'
import type {
  Activity,
  ActivitySummary,
  BulkImport,
  GeneratePlanRequest,
  PersonalBest,
  Prediction,
  Race,
  Runner,
  SavedPlan,
  SavedPlanSummary,
  SaveProfileRequest,
  StravaDisconnected,
  StravaStatus,
  TrainingPlan,
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

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
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
    throw new ApiError("We couldn't reach Taperday. Check your connection and try again.", 0)
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

  // Signed-in calls take the access token explicitly, so this module never holds sign-in state.
  me: {
    get: (token: string) => request<Runner>('/api/v1/me', {}, token),
    save: (token: string, body: SaveProfileRequest) =>
      request<Runner>('/api/v1/me', { method: 'PUT', body: JSON.stringify(body) }, token),
    exportData: (token: string) => request<unknown>('/api/v1/me/export', {}, token),
    remove: (token: string) => request<void>('/api/v1/me', { method: 'DELETE' }, token),
    plans: (token: string) => request<SavedPlanSummary[]>('/api/v1/me/plans', {}, token),
    plan: (token: string, id: string) => request<SavedPlan>(`/api/v1/me/plans/${encodeURIComponent(id)}`, {}, token),
    /** Saves as the runner's current plan. With a plan already, replaceCurrent must be true (the API answers 409 plan_active otherwise). */
    savePlan: (token: string, plan: GeneratePlanRequest, name?: string, replaceCurrent = false) =>
      request<SavedPlanSummary>('/api/v1/me/plans', { method: 'POST', body: JSON.stringify({ name: name ?? null, plan, replaceCurrent }) }, token),
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
