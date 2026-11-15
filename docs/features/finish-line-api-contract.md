# Running journey API contract (PR #262)

The server side of Training → Finish Line → Race result → Recovery → Maintenance → Next challenge. All routes are
signed-in only (`RunnerPolicy`), under `/api/v1/me/journey`, and return 404 (never 403) for another runner's ids.
Dates are the runner's **local** calendar dates (`DateOnly`), and "today" is `CoachCalls.LocalToday(runner, time)`.

Nothing here changes a generated training plan, a generator version or a v1/v2/v3 snapshot.

## Evidence rules (shared by every statistic)

- A training run is a planned session whose type is not `Race` or `Strength`.
- **Confirmed** = a non-additional `SessionCheckIn` with `Status == Done` on that session's date and type. `CutShort` and
  `Skipped` never count as confirmed. A synced Strava match (`SyncedCompletions`) is never confirmation.
- **Recorded distance** = the runner's own entered distances on check-ins (not `DistanceUnreported`) plus uploaded files
  (`ActivitySource.Upload`) dated inside the plan. A check-in linked to an upload counts once (own distance wins). Strava
  copies and planned-distance fallbacks are **not** recorded distance. No evidence → `null`, never 0 or an estimate.
- **Planned distance of confirmed runs** is labelled planned, from `PrescribedKm` if captured, else the session's planned km.

## Achievements

`Achievement { Id, RunnerId, SavedPlanId, Kind, EarnedOn, AwardedAt, CelebratedAt? }`, unique on
`(RunnerId, SavedPlanId, Kind)`. Kinds: `TrainingComplete` (every training run confirmed) and `RaceFinished` (race
result outcome `Finished`). Evaluated on every `GET /me/journey` and kept in sync idempotently (a duplicate insert from a
concurrent request is treated as already awarded). A current plan's `TrainingComplete` is withdrawn if the runner later
un-ticks a run; an archived plan's awards are kept. `RaceFinished` follows the race result. Past plans that already
qualify are awarded on first read (retrospective). `CelebratedAt` makes the film play once per runner across devices.

## Routes

| Method | Route | Body | Returns |
|---|---|---|---|
| GET | `/me/journey?page=0` | – | `JourneyDto`, 20 chapters and `hasMoreChapters` |
| GET | `/me/journey/plans/{planId}` | – | `PlanChapterDto` with `weeks` |
| POST | `/me/journey/plans/{planId}/archive` | `{ expectedVersion }` | 204; history and recovery retained |
| GET | `/me/journey/races` | – | `RaceHistoryDto`, independent and plan-linked results plus Majors definitions |
| PUT | `/me/journey/races/{id}` | `SaveRaceMemoryRequest` | `RaceMemoryDto`; stable client id for creation/retry, version for edits |
| DELETE | `/me/journey/races/{id}?expectedVersion=…` | – | 204; stale removal refused |
| POST | `/me/journey/achievements/{id}/celebrated` | – | 204 (idempotent) |
| PUT | `/me/journey/plans/{planId}/race-result` | `SaveRaceResultRequest` | `RaceResultDto` |
| DELETE | `/me/journey/plans/{planId}/race-result` | – | 204 (undo) |
| POST | `/me/journey/recovery` | `StartRecoveryRequest` | `RecoveryPlanDto` (201, or 200 if the same one already exists) |
| PATCH | `/me/journey/recovery/{id}` | `ChangeRecoveryRequest` | `RecoveryPlanDto` |
| POST | `/me/journey/recovery/{id}/check-ins` | `RecoveryCheckInRequest` | `RecoveryPlanDto` |
| POST | `/me/journey/maintenance` | `StartMaintenanceRequest` | `MaintenancePlanDto` |
| DELETE | `/me/journey/maintenance` | – | 204 |

### DTOs (JSON camelCase, enums as strings as elsewhere in the API)

```
JourneyDto { chapters: PlanChapterDto[], recovery: RecoveryPlanDto | null, maintenance: MaintenancePlanDto | null,
  hasMoreChapters: bool, page: int }

PlanChapterDto {
  planId, name, raceName, raceDate: date | null, distanceKm: number | null, status: SavedPlanStatus,
  startDate: date, lifecycle: JourneyLifecycle, training: TrainingRecapDto, raceResult: RaceResultDto | null,
  achievements: AchievementDto[], goalTime: "hh:mm:ss", weeks: ChapterWeekDto[] | null, version: string  // weeks only on detail
}
JourneyLifecycle = Active | TrainingComplete | RacePending | RaceCompleted | RaceNotCompleted | Recovering | Recovered | Archived
TrainingRecapDto {
  scheduledRuns, confirmedRuns, cutShortRuns, skippedRuns, unansweredRuns, weeks, runningDays,
  plannedKmConfirmed: number, recordedKm: number | null, recordedRuns: int,
  longestRecordedKm: number | null, longestRecordedOn: date | null,
  lastTrainingDate: date | null, allConfirmed: bool, trainingEnded: bool, raceDatePassed: bool
}
ChapterWeekDto { weekStart: date, scheduledRuns, confirmedRuns, recordedKm: number | null }
AchievementDto { id, kind: TrainingComplete | RaceFinished, planId, earnedOn: date, awardedAt, celebratedAt | null }

SaveRaceResultRequest { outcome: Finished | DidNotStart | DidNotFinish, raceDate?: date, finishTime?: "hh:mm:ss",
  distanceKm?: number, activityId?: guid, note?: string (≤ 280), expectedVersion?: string, timeKind?: RaceTimeKind }
RaceResultDto { id, planId: guid | null, outcome, raceDate, finishTime | null, distanceKm | null, activityId | null, note | null,
  goalTime | null, versusGoal: "±hh:mm:ss" | null, version: string, createdAt, updatedAt,
  timeKind, eventName | null, eventDistanceKm | null, major | null }
RaceTimeKind = Unspecified | OfficialChip | RecordedElapsed
RaceMemoryDto { eventName, eventDistanceKm | null, major | null, majorEligible: bool, result: RaceResultDto, needsReview: bool }
RaceHistoryDto { races: RaceMemoryDto[], majors: MarathonMajorDefinition[] }
SaveRaceMemoryRequest { eventName (≤ 120), eventDistanceKm, raceDate, outcome, finishTime?, distanceKm?, activityId?, note?,
  timeKind?, major?, expectedVersion? }

StartRecoveryRequest { planId?: guid, eventName?: string, distanceKm: number, raceDate: date,
  effort: Easy | Hard | AllOut, preference: Rest | Walk | CrossTraining | EasyRunning,
  runDays?: DayOfWeek[], feeling?: RecoveryFeeling, redFlags?: RecoveryRedFlag[] }
ChangeRecoveryRequest { action: Pause | Resume | Extend | Complete | End | Restart | Update,
  extendDays?: int (1–14), effort?, preference?, runDays?, expectedVersion?: string }
RecoveryCheckInRequest { date?: date, feeling: RecoveryFeeling, redFlags?: RecoveryRedFlag[], note?: string (≤ 280) }
RecoveryFeeling = GoodToGo | StillSore | VeryFatigued | PainOrInjury | NotSure
RecoveryRedFlag = SeverePain | CannotWalkNormally | MarkedSwelling | DarkUrine | Fainting | ChestPain

RecoveryPlanDto {
  id, planId | null, eventName, distanceKm, category: FiveK | TenK | Half | Marathon | Ultra | LongUltra,
  raceDate, effort, preference, runDays, status: Active | Paused | Completed | Ended, generatorVersion,
  dayNumber, endsOn, framing, readiness: NotCheckedIn | RecoveryFeeling, phase: RecoveryPhase, seekCare: bool,
  safetyMessage | null, canComplete: bool, days: RecoveryDayDto[], checkIns: RecoveryCheckInDto[],
  pauses: { from: date, to: date | null }[], extraDays, version, createdAt, updatedAt, endedOn | null
}
RecoveryPhase = RaceDay | Rest | Gentle | EasyReturn | SeekCare | Paused
RecoveryDayDto { date, dayNumber, phase, kind: RaceDay | Rest | Walk | Mobility | CrossTraining | EasyRun | SeekCare | Paused,
  title, guidance, minMinutes | null, maxMinutes | null, optional: bool, gated: bool }
RecoveryCheckInDto { date, feeling, redFlags, note | null }

StartMaintenanceRequest { daysPerWeek: 2–4, runDays?: DayOfWeek[], includeStrength?: bool }
MaintenancePlanDto { id, daysPerWeek, runDays, includeStrength, startedOn, status: Active | Ended,
  weeks: { weekStart, sessions: { date, kind: EasyRun | LongerEasyRun | Strength, title, guidance, minMinutes, maxMinutes, optional }[] }[],
  version }
```

Race history does not need an active plan. Existing plan-result routes still return their original non-null plan id; the
same record is exposed in race history, while an independently entered race has `planId: null`. New results are protected
against duplicate event editions and reused recording ids. Legacy duplicates remain available with `needsReview: true`
and cannot earn cabinet trophies until the runner removes the incorrect result. The cabinet is computed from these
confirmed, unambiguous results; it does not create extra plan achievement rows. See [collection and retention rules](../journey-and-trophy-cabinet.md).

## Recovery generator v1 (`Domain/Journey/RecoveryGenerator`)

Pure and versioned (`RecoveryGenerator.Version = 1`, stored on the plan). Category by distance: ≤ 6 km 5K, ≤ 12 10K,
≤ 25 half, ≤ 45 marathon, ≤ 60 ultra, else long ultra. Phase lengths in days after race day (rest, gentle, easy return):

| Category | Rest | Gentle | Easy return | Framing shown |
|---|---|---|---|---|
| 5K | 1 | 1 | 1 | about 2–4 days |
| 10K | 1 | 2 | 2 | about 3–7 days |
| Half | 2 | 3 | 5 | about 7–14 days |
| Marathon | 3 | 6 | 12 | about 2–4 weeks |
| Ultra | 5 | 9 | 14 | several weeks, individual |
| Long ultra | 7 | 11 | 17 | several weeks, individual |

Effort scales every phase (Easy × 0.75, Hard × 1, All-out × 1.25, rounded, at least 1 day). `extraDays` lengthen easy
return. Paused days don't advance the phase clock and push the end date back.

**Readiness gate.** Each day's phase is the lower of its scheduled phase and a ceiling set by the latest check-in on or
before that day (for future days, the latest check-in so far): none → Gentle; Good to go → Easy return; Not sure or Still
sore → Gentle; Very fatigued → Rest; Pain or injury, or any red flag → Seek care (no exercise at all until a later
check-in says otherwise). A runner never progresses without saying they are ready, and the schedule never escalates.

**Day content.** Everything but race day is optional. Race day: celebrate, eat, drink, rest. Rest phase: rest, with an
optional 10–20 minute walk on alternate days unless the runner prefers rest. Gentle: alternate rest with walk (20–30
min), mobility (10–15 min, for "rest" preference) or very light cross-training (20–30 min). Easy return: easy
conversational runs on up to half the runner's run days (2–3 a week), ramping from 15–20/25 to at most 30–45 minutes,
the rest rest days. Never pace, intervals, tempo, long runs or tests. `gated` marks future days that only apply after a
"Good to go" check-in. `canComplete` is true when the latest check-in is Good to go.

## Maintenance generator v1 (`Domain/Journey/MaintenanceGenerator`)

2–4 easy, conversational runs a week on the runner's chosen days (default: their last plan's run days, else Tue/Thu/Sat
/Sun), 25–40 minutes, and with 3+ days one longer easy run of 40–60 minutes on the last of them. Optional strength (20–30
minutes) on one non-run day if asked. All optional, no race date, no hard sessions. Served as the current week plus the
next three.

## As built (differences from the proposal above)

- `TrainingRecapDto.swappedRuns`: runs swapped for an easy run are answered but not confirmed, so the counts add up.
- CORS allows `PATCH` (needed by `/recovery/{id}` from the app's own origin).
- `readiness` is `RecoveryReadinessState`; pauses are `RecoveryPauseDto`; maintenance weeks `MaintenanceWeekDto`.
- Times are .NET TimeSpans (`hh:mm:ss`, `d.hh:mm:ss` past a day); `versusGoal` is `±hh:mm:ss` in total hours.
- `version` is the row version in base64. Stale `expectedVersion` → 409 `race_result_changed` / `recovery_changed`.
- `optional` is false on race day and on seek-care days (advice, not exercise). `framing` is a short range ("about 7–14
  days"); the app words it as a sentence.
- `journey.recovery` is the open recovery, else one that finished in the last 30 days.
- A plan whose catalogue race no longer exists is left out of `chapters` (its detail route is 404).
- Lifecycle precedence: recovery (Recovering / Recovered) → race result (RaceCompleted / RaceNotCompleted) → Archived →
  race date passed (RacePending) → every run confirmed (TrainingComplete) → training ended (RacePending) → Active.
- Errors: 409 `race_result_required` (recovery for a plan with no result, or a DNS), `recovery_active` (another recovery
  open), `recovery_closed` (changing a finished recovery other than Restart; repeated Complete/End is idempotent),
  `recovery_not_ready` (Complete before a "Good to go" check-in).
- Restart begins again from today: the days since the race show as a pause, extra days reset, check-ins kept.
- Persistence: migration `20261114160249_AddRunningJourney`, additive only: `RaceResults`, `Achievements`,
  `RecoveryPlans` (check-ins and pauses as JSON columns), `MaintenancePlans`. Unique: one result per plan, one award of
  each kind per plan, one open recovery per runner, one recovery per plan, one active maintenance per runner. Race
  results and awards go with their plan; recovery and maintenance with the runner (account deletion cascades).
- Removing a plan that has check-ins, a race result, awards or a recovery archives it instead of deleting it. The
  personal-data export includes the journey.
