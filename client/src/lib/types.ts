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
export type SessionStep = Schemas['SessionStepDto']
export type Exercise = Schemas['Exercise']
export type StrengthExercise = Schemas['StrengthExerciseDto']
export type PaceZoneRange = Schemas['PaceZoneDto']
export type Prediction = Schemas['PredictionDto']
export type GeneratePlanRequest = Schemas['GeneratePlanQuery']
export type GoalOutlook = Schemas['GoalOutlookDto']
export type GoalVerdict = Schemas['GoalVerdict']
export type Runner = Schemas['RunnerDto']
export type Units = Schemas['Units']
export type SaveProfileRequest = Schemas['SaveProfileCommand']
export type AcceptPrivacyRequest = Schemas['AcceptPrivacyNoticeCommand']
export type SavedPlanSummary = Schemas['SavedPlanSummaryDto']
export type SavedPlan = Schemas['SavedPlanDto']
export type SavedPlanStatus = Schemas['SavedPlanStatus']
export type CoachNote = Schemas['CoachNoteDto']
export type CoachVerdict = Schemas['CoachVerdict']
export type CoachReason = Schemas['CoachReason']
export type CoachingProposal = Schemas['CoachingProposalDto']
export type RemainingWeekProposal = Schemas['RemainingWeekProposalDto']
export type RecoveryReadiness = Schemas['RecoveryReadiness']
export type CheckIn = Schemas['CheckInDto']
export type CheckInRequest = Omit<Schemas['CheckInRequest'], 'independentMetrics'> & { independentMetrics?: boolean }
export type CheckInStatus = Schemas['CheckInStatus']
export type PainLevel = Schemas['PainLevel']
export type BodyArea = Schemas['BodyArea']
export type Setback = Schemas['Setback']
export type RunWalkMode = Schemas['RunWalkMode']
export type RunWalk = Schemas['RunWalkDto']
export type Replan = Schemas['ReplanDto']
export type Activity = Schemas['ActivityDto']
export type ActivitySummary = Schemas['ActivitySummaryDto']
export type ActivityKind = Schemas['ActivityKind']
export type Split = Schemas['SplitDto']
export type BestEffort = Schemas['BestEffortDto']
export type PlannedVsActual = Schemas['PlannedVsActualDto']
export type Halves = Schemas['HalvesDto']
export type Review = Schemas['ReviewDto']
export type HeartRate = Schemas['HeartRateDto']
export type HeartRateZone = Schemas['HeartRateZoneDto']
export type BulkImport = Schemas['BulkImportDto']
export type BulkImportFile = Schemas['BulkImportFileDto']
export type ImportStatus = Schemas['ImportStatus']
export type ActivitySource = Schemas['ActivitySource']
export type RunSource = Schemas['SourceDto']
export type RecordingFormat = Schemas['RecordingFormat']
export type RunData = Schemas['RunDataDto']
export type TotalsBreakdown = Schemas['TotalsBreakdownDto']
export type PossibleDuplicate = Schemas['PossibleDuplicateDto']
export type SyncIssue = Schemas['SyncIssueDto']
export type PersonalBest = Schemas['PersonalBestDto']
// Older responses omit this additive availability flag.
export type LoggedRun = Omit<Schemas['LoggedRunDto'], 'distanceUnreported' | 'cachedUntil'> & { distanceUnreported?: boolean; cachedUntil?: string | null }
export type PaceVerdict = Schemas['PaceVerdict']
export type StravaStatus = Schemas['StravaStatusDto']
export type StravaDisconnected = Schemas['StravaDisconnectedDto']
export type Reminders = Schemas['RemindersDto']
export type CalendarLink = Schemas['CalendarLinkDto']
export type ReminderDevice = Schemas['ReminderDeviceDto']
export type TurnOnRemindersRequest = Schemas['TurnOnRemindersCommand']

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

export type NotificationPreferences = Schemas['NotificationPreferencesDto']
