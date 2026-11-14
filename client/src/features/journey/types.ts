import type { components } from '../../lib/api-schema'

// The running journey API (docs/features/finish-line-api-contract.md), straight from the generated schema so the
// screens and the server can't drift apart.
type Schemas = components['schemas']

export type JourneyLifecycle = Schemas['JourneyLifecycle']
export type AchievementKind = Schemas['AchievementKind']
export type RaceOutcome = Schemas['RaceOutcome']
export type RecoveryEffort = Schemas['RecoveryEffort']
export type RecoveryPreference = Schemas['RecoveryPreference']
export type RecoveryFeeling = Schemas['RecoveryFeeling']
export type RecoveryRedFlag = Schemas['RecoveryRedFlag']
export type RecoveryPhase = Schemas['RecoveryPhase']
export type RecoveryDayKind = Schemas['RecoveryDayKind']
export type RecoveryStatus = Schemas['RecoveryStatus']
export type RecoveryAction = Schemas['RecoveryAction']
export type MaintenanceKind = Schemas['MaintenanceSessionKind']

export type TrainingRecap = Schemas['TrainingRecapDto']
export type ChapterWeek = Schemas['ChapterWeekDto']
export type Achievement = Schemas['AchievementDto']
export type RaceResult = Schemas['RaceResultDto']
export type PlanChapter = Schemas['PlanChapterDto']
export type RecoveryDay = Schemas['RecoveryDayDto']
export type RecoveryCheckIn = Schemas['RecoveryCheckInDto']
export type RecoveryPlan = Schemas['RecoveryPlanDto']
export type MaintenanceSession = Schemas['MaintenanceSessionDto']
export type MaintenancePlan = Schemas['MaintenancePlanDto']
export type Journey = Schemas['JourneyDto']

export type SaveRaceResult = Schemas['SaveRaceResultRequest']
export type StartRecovery = Schemas['StartRecoveryRequest']
export type ChangeRecovery = Schemas['ChangeRecoveryRequest']
export type RecoveryCheckInRequest = Schemas['RecoveryCheckInRequest']
export type StartMaintenance = Schemas['StartMaintenanceRequest']
