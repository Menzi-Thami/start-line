// Synthetic journey data for tests and the browser fixtures. Never a real runner's.
import { addDays } from '../../lib/format'
import type { Journey, MaintenancePlan, PlanChapter, RaceResult, RecoveryDay, RecoveryPlan, TrainingRecap } from './types'

export const PLAN_ID = '11111111-1111-4111-8111-111111111111'

export function recap(overrides: Partial<TrainingRecap> = {}): TrainingRecap {
  return {
    scheduledRuns: 38,
    confirmedRuns: 38,
    cutShortRuns: 0,
    skippedRuns: 0,
    unansweredRuns: 0,
    weeks: 12,
    runningDays: 38,
    plannedKmConfirmed: 312.5,
    recordedKm: 286.4,
    recordedRuns: 31,
    longestRecordedKm: 19.2,
    longestRecordedOn: '2026-10-25',
    lastTrainingDate: '2026-11-14',
    allConfirmed: true,
    trainingEnded: true,
    raceDatePassed: false,
    swappedRuns: 0,
    ...overrides,
  }
}

export function chapter(overrides: Partial<PlanChapter> = {}): PlanChapter {
  return {
    planId: PLAN_ID,
    name: 'Hoka Half',
    raceName: 'Hoka Half Marathon',
    raceDate: '2026-11-15',
    distanceKm: 21.1,
    status: 'Active',
    startDate: '2026-08-24',
    lifecycle: 'TrainingComplete',
    training: recap(),
    raceResult: null,
    achievements: [],
    goalTime: '01:55:00',
    detailsUnavailable: false,
    weeks: Array.from({ length: 12 }, (_, i) => ({ weekStart: addDays('2026-08-24', i * 7), scheduledRuns: 3 + (i % 2), confirmedRuns: 3 + (i % 2), recordedKm: 20 + i })),
    ...overrides,
  }
}

export function raceResult(overrides: Partial<RaceResult> = {}): RaceResult {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    planId: PLAN_ID,
    outcome: 'Finished',
    raceDate: '2026-11-15',
    finishTime: '01:52:10',
    distanceKm: 21.1,
    activityId: null,
    note: null,
    goalTime: '01:55:00',
    versusGoal: '-00:02:50',
    version: 'AAAAAAAAB9E=',
    createdAt: '2026-11-15T14:00:00Z',
    updatedAt: '2026-11-15T14:00:00Z',
    ...overrides,
  }
}

const KINDS: RecoveryDay['kind'][] = ['RaceDay', 'Rest', 'Rest', 'Walk', 'Rest', 'Walk', 'Rest', 'EasyRun', 'Rest', 'EasyRun', 'Rest']

export function recovery(overrides: Partial<RecoveryPlan> = {}): RecoveryPlan {
  const raceDate = overrides.raceDate ?? '2026-11-15'
  const days: RecoveryDay[] = KINDS.map((kind, i) => ({
    date: addDays(raceDate, i),
    dayNumber: i,
    phase: kind === 'RaceDay' ? 'RaceDay' : i <= 2 ? 'Rest' : i <= 6 ? 'Gentle' : 'EasyReturn',
    kind,
    title: kind === 'RaceDay' ? 'Race day' : kind === 'Rest' ? 'Rest' : kind === 'Walk' ? 'Easy walk' : 'Easy run',
    guidance: kind === 'Rest' ? 'Rest is training too.' : kind === 'EasyRun' ? 'Short, conversational effort. Stop if anything hurts.' : 'Gentle and short.',
    minMinutes: kind === 'Walk' ? 20 : kind === 'EasyRun' ? 15 : null,
    maxMinutes: kind === 'Walk' ? 30 : kind === 'EasyRun' ? 25 : null,
    optional: kind !== 'RaceDay',
    gated: kind === 'EasyRun',
  }))
  return {
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    planId: PLAN_ID,
    eventName: 'Hoka Half Marathon',
    distanceKm: 21.1,
    category: 'Half',
    raceDate,
    effort: 'Hard',
    preference: 'Walk',
    runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'],
    status: 'Active',
    generatorVersion: 1,
    dayNumber: 3,
    endsOn: days.at(-1)!.date,
    framing: 'After a half marathon, recovery usually takes about 7–14 days.',
    readiness: 'NotCheckedIn',
    phase: 'Rest',
    seekCare: false,
    safetyMessage: null,
    canComplete: false,
    days,
    checkIns: [],
    pauses: [],
    extraDays: 0,
    version: 'AAAAAAAAB+E=',
    createdAt: '2026-11-15T18:00:00Z',
    updatedAt: '2026-11-15T18:00:00Z',
    endedOn: null,
    ...overrides,
  }
}

export function maintenance(overrides: Partial<MaintenancePlan> = {}): MaintenancePlan {
  return {
    id: 'cccccccc-0000-4000-8000-000000000003',
    daysPerWeek: 3,
    runDays: ['Tuesday', 'Thursday', 'Saturday'],
    includeStrength: false,
    startedOn: '2026-12-01',
    status: 'Active',
    weeks: [{
      weekStart: '2026-11-30',
      sessions: [
        { date: '2026-12-01', kind: 'EasyRun', title: 'Easy run', guidance: 'Conversational.', minMinutes: 25, maxMinutes: 40, optional: true },
        { date: '2026-12-03', kind: 'EasyRun', title: 'Easy run', guidance: 'Conversational.', minMinutes: 25, maxMinutes: 40, optional: true },
        { date: '2026-12-05', kind: 'LongerEasyRun', title: 'Longer easy run', guidance: 'Relaxed.', minMinutes: 40, maxMinutes: 60, optional: true },
      ],
    }],
    version: 'AAAAAAAACAE=',
    ...overrides,
  }
}

export const journeyOf = (chapters: PlanChapter[], rest: Partial<Journey> = {}): Journey => ({ chapters, recovery: null, maintenance: null, hasMoreChapters: false, page: 0, ...rest })
