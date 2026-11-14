import type { DayOfWeek } from '../../lib/types'

// The running journey API (docs/features/finish-line-api-contract.md). Kept here so the journey's screens read as one
// feature; the shapes follow the server DTOs exactly.

export type JourneyLifecycle = 'Active' | 'TrainingComplete' | 'RacePending' | 'RaceCompleted' | 'RaceNotCompleted' | 'Recovering' | 'Recovered' | 'Archived'
export type AchievementKind = 'TrainingComplete' | 'RaceFinished'
export type RaceOutcome = 'Finished' | 'DidNotStart' | 'DidNotFinish'
export type RecoveryEffort = 'Easy' | 'Hard' | 'AllOut'
export type RecoveryPreference = 'Rest' | 'Walk' | 'CrossTraining' | 'EasyRunning'
export type RecoveryFeeling = 'GoodToGo' | 'StillSore' | 'VeryFatigued' | 'PainOrInjury' | 'NotSure'
export type RecoveryRedFlag = 'SeverePain' | 'CannotWalkNormally' | 'MarkedSwelling' | 'DarkUrine' | 'Fainting' | 'ChestPain'
export type RecoveryPhase = 'RaceDay' | 'Rest' | 'Gentle' | 'EasyReturn' | 'SeekCare' | 'Paused'
export type RecoveryDayKind = 'RaceDay' | 'Rest' | 'Walk' | 'Mobility' | 'CrossTraining' | 'EasyRun' | 'SeekCare' | 'Paused'
export type RecoveryStatus = 'Active' | 'Paused' | 'Completed' | 'Ended'
export type RecoveryAction = 'Pause' | 'Resume' | 'Extend' | 'Complete' | 'End' | 'Restart' | 'Update'
export type MaintenanceKind = 'EasyRun' | 'LongerEasyRun' | 'Strength'

export interface TrainingRecap {
  scheduledRuns: number
  confirmedRuns: number
  cutShortRuns: number
  skippedRuns: number
  unansweredRuns: number
  weeks: number
  runningDays: number
  plannedKmConfirmed: number
  recordedKm: number | null
  recordedRuns: number
  longestRecordedKm: number | null
  longestRecordedOn: string | null
  lastTrainingDate: string | null
  allConfirmed: boolean
  trainingEnded: boolean
  raceDatePassed: boolean
}

export interface ChapterWeek {
  weekStart: string
  scheduledRuns: number
  confirmedRuns: number
  recordedKm: number | null
}

export interface Achievement {
  id: string
  kind: AchievementKind
  planId: string
  earnedOn: string
  awardedAt: string
  celebratedAt: string | null
}

export interface RaceResult {
  id: string
  planId: string
  outcome: RaceOutcome
  raceDate: string
  finishTime: string | null
  distanceKm: number | null
  activityId: string | null
  note: string | null
  goalTime: string | null
  versusGoal: string | null
  version: string
  createdAt: string
  updatedAt: string
}

export interface PlanChapter {
  planId: string
  name: string
  raceName: string
  raceDate: string | null
  distanceKm: number | null
  status: 'Active' | 'Archived'
  startDate: string
  lifecycle: JourneyLifecycle
  training: TrainingRecap
  raceResult: RaceResult | null
  achievements: Achievement[]
  goalTime: string
  weeks: ChapterWeek[] | null
}

export interface RecoveryDay {
  date: string
  dayNumber: number
  phase: RecoveryPhase
  kind: RecoveryDayKind
  title: string
  guidance: string
  minMinutes: number | null
  maxMinutes: number | null
  optional: boolean
  gated: boolean
}

export interface RecoveryCheckIn {
  date: string
  feeling: RecoveryFeeling
  redFlags: RecoveryRedFlag[]
  note: string | null
}

export interface RecoveryPlan {
  id: string
  planId: string | null
  eventName: string
  distanceKm: number
  category: 'FiveK' | 'TenK' | 'Half' | 'Marathon' | 'Ultra' | 'LongUltra'
  raceDate: string
  effort: RecoveryEffort
  preference: RecoveryPreference
  runDays: DayOfWeek[]
  status: RecoveryStatus
  generatorVersion: number
  dayNumber: number
  endsOn: string
  framing: string
  readiness: 'NotCheckedIn' | RecoveryFeeling
  phase: RecoveryPhase
  seekCare: boolean
  safetyMessage: string | null
  canComplete: boolean
  days: RecoveryDay[]
  checkIns: RecoveryCheckIn[]
  pauses: { from: string; to: string | null }[]
  extraDays: number
  version: string
  createdAt: string
  updatedAt: string
  endedOn: string | null
}

export interface MaintenanceSession {
  date: string
  kind: MaintenanceKind
  title: string
  guidance: string
  minMinutes: number
  maxMinutes: number
  optional: boolean
}

export interface MaintenancePlan {
  id: string
  daysPerWeek: number
  runDays: DayOfWeek[]
  includeStrength: boolean
  startedOn: string
  status: 'Active' | 'Ended'
  weeks: { weekStart: string; sessions: MaintenanceSession[] }[]
  version: string
}

export interface Journey {
  chapters: PlanChapter[]
  recovery: RecoveryPlan | null
  maintenance: MaintenancePlan | null
}

export interface SaveRaceResult {
  outcome: RaceOutcome
  raceDate?: string
  finishTime?: string | null
  distanceKm?: number | null
  activityId?: string | null
  note?: string | null
  expectedVersion?: string | null
}

export interface StartRecovery {
  planId?: string | null
  eventName?: string | null
  distanceKm: number
  raceDate: string
  effort: RecoveryEffort
  preference: RecoveryPreference
  runDays?: DayOfWeek[]
  feeling?: RecoveryFeeling | null
  redFlags?: RecoveryRedFlag[]
}

export interface ChangeRecovery {
  action: RecoveryAction
  extendDays?: number
  effort?: RecoveryEffort
  preference?: RecoveryPreference
  runDays?: DayOfWeek[]
  expectedVersion?: string
}

export interface RecoveryCheckInRequest {
  date?: string
  feeling: RecoveryFeeling
  redFlags?: RecoveryRedFlag[]
  note?: string | null
}

export interface StartMaintenance {
  daysPerWeek: number
  runDays?: DayOfWeek[]
  includeStrength?: boolean
}
