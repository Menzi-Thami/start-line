import type { components } from './api-schema'

// Aliases over the generated OpenAPI types. Regenerate with `npm run gen:api`; never hand-edit shapes here.
type Schemas = components['schemas']

export type DayOfWeek = Schemas['DayOfWeek']
export type Experience = Schemas['Experience']
export type PaceZone = Schemas['PaceZone']
export type SessionType = Schemas['SessionType']
export type TrainingPhase = Schemas['TrainingPhase']
export type DistanceCategory = Schemas['DistanceCategory']
export type Race = Schemas['RaceDto']
export type TrainingPlan = Schemas['TrainingPlanDto']
export type PlanWeek = Schemas['PlanWeekDto']
export type Session = Schemas['SessionDto']
export type PaceZoneRange = Schemas['PaceZoneDto']
export type Prediction = Schemas['PredictionDto']
export type GeneratePlanRequest = Schemas['GeneratePlanQuery']
export type Runner = Schemas['RunnerDto']
export type Units = Schemas['Units']
export type SaveProfileRequest = Schemas['SaveProfileCommand']
export type SavedPlanSummary = Schemas['SavedPlanSummaryDto']
export type SavedPlan = Schemas['SavedPlanDto']
export type Activity = Schemas['ActivityDto']
export type ActivitySummary = Schemas['ActivitySummaryDto']
export type ActivityKind = Schemas['ActivityKind']
export type Split = Schemas['SplitDto']
export type BestEffort = Schemas['BestEffortDto']
export type PlannedVsActual = Schemas['PlannedVsActualDto']
export type Halves = Schemas['HalvesDto']

/** Monday first, the way most runners plan a week. */
export const WEEK: readonly DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const SHORT_DAY: Record<DayOfWeek, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
}
