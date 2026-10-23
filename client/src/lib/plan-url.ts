import { WEEK, type DayOfWeek, type Experience, type GeneratePlanRequest, type Setback } from './types'
import { parseTimeSpan, toTimeSpan } from './format'

/** Everything needed to rebuild a plan. It lives in the URL, so a plan is shared by sharing the link. */
export interface PlanInputs {
  raceSlug?: string
  raceName?: string
  distanceKm?: number
  raceDate?: string
  goalSeconds: number
  runDays: DayOfWeek[]
  longRunDay: DayOfWeek
  currentWeeklyKm?: number
  experience: Experience
  strengthDays: DayOfWeek[]
  planFrom?: string
  /**
   * The plan generator version the plan was first built with. Undefined is version 1: every link made before plans were
   * shaped per distance, which keeps its shape. New plans get LATEST_PLAN_VERSION.
   */
  version?: number
  /** "Replan from here": the plan is rebuilt from this day, after this setback. Both or neither. */
  replan?: ReplanInputs
  /** A recent race or hard effort. It never changes the plan: it lets the coach say whether the goal is realistic. */
  recent?: RecentResultInputs
}

export interface RecentResultInputs {
  km: number
  seconds: number
  /** The day it was run, as YYYY-MM-DD. */
  date: string
}

export interface ReplanInputs {
  from: string
  setback: Setback
  /** What the runner ran last week. Needed when they're behind; optional otherwise. */
  recentWeeklyKm?: number
}

/** The generator version a new plan is built with. Older links and saved plans keep theirs. */
export const LATEST_PLAN_VERSION = 2

// Short and readable in a shared link: ?re=2026-12-03&why=ill&last=18
const SETBACK_CODES: Record<Setback, string> = {
  MissedTraining: 'missed',
  Illness: 'ill',
  Injury: 'injured',
  Behind: 'behind',
}

const DAY_CODES: Record<DayOfWeek, string> = {
  Monday: 'mo',
  Tuesday: 'tu',
  Wednesday: 'we',
  Thursday: 'th',
  Friday: 'fr',
  Saturday: 'sa',
  Sunday: 'su',
}

const EXPERIENCE: readonly Experience[] = ['New', 'Regular', 'Experienced']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const encodeDays = (days: DayOfWeek[]) => WEEK.filter((d) => days.includes(d)).map((d) => DAY_CODES[d]).join('.')

const decodeDays = (value: string | null): DayOfWeek[] =>
  value ? WEEK.filter((d) => value.split('.').includes(DAY_CODES[d])) : []

const positive = (value: string | null): number | undefined => {
  if (value === null || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function toSearchParams(inputs: PlanInputs): URLSearchParams {
  const p = new URLSearchParams()
  if (inputs.raceSlug) {
    p.set('race', inputs.raceSlug)
  } else {
    if (inputs.distanceKm) p.set('km', String(inputs.distanceKm))
    if (inputs.raceDate) p.set('date', inputs.raceDate)
    if (inputs.raceName) p.set('name', inputs.raceName)
  }
  p.set('goal', String(Math.round(inputs.goalSeconds)))
  p.set('days', encodeDays(inputs.runDays))
  p.set('long', DAY_CODES[inputs.longRunDay])
  p.set('exp', inputs.experience.toLowerCase())
  if (inputs.currentWeeklyKm) p.set('now', String(inputs.currentWeeklyKm))
  if (inputs.strengthDays.length > 0) p.set('gym', encodeDays(inputs.strengthDays))
  if (inputs.planFrom) p.set('from', inputs.planFrom)
  if (inputs.version && inputs.version > 1) p.set('v', String(inputs.version))
  if (inputs.recent) {
    p.set('rk', String(inputs.recent.km))
    p.set('rt', String(Math.round(inputs.recent.seconds)))
    p.set('rd', inputs.recent.date)
  }
  if (inputs.replan) {
    p.set('re', inputs.replan.from)
    p.set('why', SETBACK_CODES[inputs.replan.setback])
    if (inputs.replan.recentWeeklyKm) p.set('last', String(inputs.replan.recentWeeklyKm))
  }
  return p
}

function replanFrom(params: URLSearchParams): ReplanInputs | undefined {
  const from = params.get('re')
  const setback = (Object.keys(SETBACK_CODES) as Setback[]).find((s) => SETBACK_CODES[s] === params.get('why'))
  if (!from || !ISO_DATE.test(from) || !setback) return undefined
  const recentWeeklyKm = positive(params.get('last'))
  // Behind means "pick up from what I ran", so without that distance the replan is dropped, not guessed at.
  if (setback === 'Behind' && recentWeeklyKm === undefined) return undefined
  return { from, setback, recentWeeklyKm }
}

// A recent result is a distance, a time and a day, all or nothing: part of one is dropped, not guessed at.
function recentFrom(params: URLSearchParams): RecentResultInputs | undefined {
  const km = positive(params.get('rk'))
  const seconds = positive(params.get('rt'))
  const date = params.get('rd')
  return km !== undefined && seconds !== undefined && date !== null && ISO_DATE.test(date) ? { km, seconds, date } : undefined
}

// Version 1 is the default, so it never shows in a link. A version this app doesn't know yet is kept: the API then says
// the link is from a newer Taperday, rather than the plan quietly changing shape.
const generatorVersion = (value: string | null): number | undefined => {
  const n = positive(value)
  return n !== undefined && Number.isInteger(n) && n > 1 ? n : undefined
}

/** Returns null unless the link describes a complete plan. Anything malformed is dropped, not guessed at. */
export function fromSearchParams(params: URLSearchParams): PlanInputs | null {
  const goalSeconds = positive(params.get('goal'))
  const runDays = decodeDays(params.get('days'))
  const longRunDay = decodeDays(params.get('long'))[0]
  const raceSlug = params.get('race')?.trim() || undefined
  const distanceKm = positive(params.get('km'))
  const raceDate = params.get('date') ?? undefined

  const hasRace = raceSlug !== undefined || (distanceKm !== undefined && raceDate !== undefined && ISO_DATE.test(raceDate))
  if (!goalSeconds || !hasRace || runDays.length < 3 || !longRunDay || !runDays.includes(longRunDay)) {
    return null
  }

  const experience = EXPERIENCE.find((e) => e.toLowerCase() === params.get('exp')) ?? 'Regular'
  const planFrom = params.get('from') ?? undefined

  return {
    raceSlug,
    raceName: raceSlug ? undefined : params.get('name')?.slice(0, 100) || undefined,
    distanceKm: raceSlug ? undefined : distanceKm,
    raceDate: raceSlug ? undefined : raceDate,
    goalSeconds,
    runDays,
    longRunDay,
    currentWeeklyKm: positive(params.get('now')),
    experience,
    strengthDays: decodeDays(params.get('gym')).slice(0, 3),
    planFrom: planFrom && ISO_DATE.test(planFrom) ? planFrom : undefined,
    version: generatorVersion(params.get('v')),
    replan: replanFrom(params),
    recent: recentFrom(params),
  }
}

/** The inputs a saved plan was built from, ready to rebuild and to share as a link. */
export function fromRequest(request: GeneratePlanRequest): PlanInputs | null {
  const goalSeconds = parseTimeSpan(request.goalTime)
  if (!goalSeconds) return null
  return {
    raceSlug: request.raceSlug ?? undefined,
    raceName: request.raceName ?? undefined,
    distanceKm: request.distanceKm ?? undefined,
    raceDate: request.raceDate ?? undefined,
    goalSeconds,
    runDays: WEEK.filter((d) => request.runDays.includes(d)),
    longRunDay: request.longRunDay,
    currentWeeklyKm: request.currentWeeklyKm ?? undefined,
    experience: request.experience ?? 'Regular',
    strengthDays: WEEK.filter((d) => (request.strengthDays ?? []).includes(d)),
    planFrom: request.planFrom ?? undefined,
    version: generatorVersion(request.version?.toString() ?? null),
    replan:
      request.replanFrom && request.setback
        ? { from: request.replanFrom, setback: request.setback, recentWeeklyKm: request.recentWeeklyKm ?? undefined }
        : undefined,
    recent: recentFromRequest(request),
  }
}

function recentFromRequest(request: GeneratePlanRequest): RecentResultInputs | undefined {
  const seconds = request.recentResultTime ? parseTimeSpan(request.recentResultTime) : null
  return request.recentResultKm && seconds && request.recentResultDate
    ? { km: request.recentResultKm, seconds, date: request.recentResultDate }
    : undefined
}

export function toRequest(inputs: PlanInputs): GeneratePlanRequest {
  return {
    raceSlug: inputs.raceSlug ?? null,
    raceName: inputs.raceSlug ? null : (inputs.raceName ?? null),
    distanceKm: inputs.raceSlug ? null : (inputs.distanceKm ?? null),
    raceDate: inputs.raceSlug ? null : (inputs.raceDate ?? null),
    goalTime: toTimeSpan(inputs.goalSeconds),
    runDays: inputs.runDays,
    longRunDay: inputs.longRunDay,
    currentWeeklyKm: inputs.currentWeeklyKm ?? null,
    experience: inputs.experience,
    strengthDays: inputs.strengthDays,
    planFrom: inputs.planFrom ?? null,
    version: inputs.version ?? null,
    replanFrom: inputs.replan?.from ?? null,
    setback: inputs.replan?.setback ?? null,
    recentWeeklyKm: inputs.replan?.recentWeeklyKm ?? null,
    recentResultKm: inputs.recent?.km ?? null,
    recentResultTime: inputs.recent ? toTimeSpan(inputs.recent.seconds) : null,
    recentResultDate: inputs.recent?.date ?? null,
  }
}
