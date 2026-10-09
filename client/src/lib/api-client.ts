import { toTimeSpan } from './format'
import type { GeneratePlanRequest, Prediction, Race, TrainingPlan } from './types'

/** The one place the app talks to the network. Every failure becomes an ApiError with words a runner can act on. */
export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string[]>

  constructor(message: string, status: number, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

interface Problem {
  title?: string | null
  detail?: string | null
  errors?: Record<string, string[]>
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError("We couldn't reach Start Line. Check your connection and try again.", 0)
  }

  if (response.ok) {
    return (await response.json()) as T
  }

  if (response.status === 429) {
    const wait = Number(response.headers.get('Retry-After'))
    throw new ApiError(
      `That's a lot of plans in a short time. Try again in ${Number.isFinite(wait) && wait > 0 ? `${wait} seconds` : 'a minute'}.`,
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

  throw new ApiError(problem.detail ?? problem.title ?? 'That request didn’t work.', response.status, problem.errors ?? {})
}

export const api = {
  races: (signal?: AbortSignal) => request<Race[]>('/api/v1/races', { signal }),

  plan: (body: GeneratePlanRequest, signal?: AbortSignal) =>
    request<TrainingPlan>('/api/v1/plans', { method: 'POST', body: JSON.stringify(body), signal }),

  predict: (fromKm: number, seconds: number, toKm: number, signal?: AbortSignal) => {
    const query = new URLSearchParams({ fromKm: String(fromKm), time: toTimeSpan(seconds), toKm: String(toKm) })
    return request<Prediction>(`/api/v1/predictions?${query}`, { signal })
  },
}
