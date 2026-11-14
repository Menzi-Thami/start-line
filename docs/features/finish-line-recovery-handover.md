# Taperday Finish Line — complete design and implementation handover

> **Status (2026-11-14, implementation):** the journey is implemented end to end in PR #262: account-backed achievements and history, race results, recovery generator v1 with readiness check-ins, maintenance, Home/Plan/calendar integration and the Finish Line film. Results, screenshots and limits: `docs/qa/2026-11-14/finish-line/README.md`; API as built: `docs/features/finish-line-api-contract.md`. Boxes below are ticked only where a test or browser check was run and passed. The Night Run / Frame look, the Runner and existing generator versions are unchanged.

## 1. Product contract

A training plan is a chapter in a runner's journey, not a dead-end page. The durable journey is:

```
Training complete -> Finish Line celebration -> pre-race readiness
                                         |
                           Race happens / result recorded
                                         v
                          Race achievement + race review
                                         v
                           Recovery plan / check-ins
                                         v
                          Maintenance or next race plan
```

The product must distinguish:
1. **Training completed:** all scheduled *eligible training runs* have durable confirmed completion; race itself not included. A completion animation and training card are earned.
2. **Training period ended, but not all sessions confirmed:** show a factual training journey recap without claiming 'all workouts done', a perfect badge, or race completion. Provide the option to review missing sessions. Expiry of a date alone is not proof of training completion.
3. **Race completed:** only explicit race-result entry, runner confirmation, or unambiguous linked recording (with consent/confirmation when ambiguous) earns a race-finisher badge. The race date passing is never enough.
4. **Recovery:** offered after an actual race (or a runner's explicit assertion that the race was done); not auto-started merely because the training plan or date ended.
5. **Next chapter:** after recovery or when the user deliberately chooses, offer maintenance running and building a new race plan.

Plan completion may precede race day. Never prompt a race finisher message merely from finishing the last pre-race shakeout.

## 2. Screen flow and user experience

### A. Training Finish Line
- Full-viewport special animation **once per completed plan per user** after durable completion, with existing Runner running through a finish tape, familiar Taperday colours, high-contrast heading 'YOU DID IT', and optional tasteful confetti. Provide a visible 'See my training story' action, Escape/close behaviour, focus management/trapping, scroll lock, reduced-motion static alternative, no sound by default. Do not block navigation.
- Reopen from Plan/Training History with 'Replay finish line'.
- Metrics: scheduled running workouts, confirmed completions, consistency, total weeks, unique running days, *actual* recorded distance where known, longest **recorded** run, and pace improvements only if comparable evidence exists. Clearly distinguish estimated/planned vs actual; do not inflate mileage from tick-only sessions.
- Personal highlights and progress chronology; absent evidence gets graceful explanatory empty state. Use the latest saved plan revisions without losing historical completed sessions.
- Prominent share-card/download action; copy, native share where supported; vector/raster downloads for WhatsApp/Instagram/Strava. Embed accessible text, portrait Story dimensions and restrained branded template. No sensitive data leaked.
- If race lies ahead: congratulate on the **training**, offer a race-week checklist/taper guidance, and say 'Race day is next'.
- If race passed but no result: 'How did race day go?' with buttons 'I finished', 'I didn't start', 'I didn't finish', 'I'll add it later'. Respect the user's report; no pressure.
- If training is incomplete: show honest recap, do not force skipped workouts to count, and allow user to record or correct past sessions.

### B. Race Finish Line (separate milestone)
- Race confirmation / matching flow. Accept duration, distance, date and optional linked activity, with validation, corrections and undo. Avoid automatically matching a different race at the same distance or multiple runs on a race day.
- Compare actual race performance with stated goal when available, no shaming for slower results or DNFs.
- Celebrate accomplishment using same brand runner but visually distinct from training-finished celebration.
- Save race-specific milestone separately from training-completion milestone.

### C. Your Running Journey
- Account-backed, cross-device immutable-enough history of completed and archived plans, race results, achievement types, dates, and **source/quality of each statistic**; inspect/correct personal running history.
- Existing backend keeps archived plans but current UI lacks a 'My Plans' archive. Add authenticated history browsing securely and safely; do not overwrite old milestones when a runner builds a new plan.
- Anonymous device-only plans can still celebrate locally with an explicit note that device-local history may disappear; never pretend it syncs across devices.
- Retrospective evaluation: existing plans that qualify must be recognised, without requiring users to rebuild or complete another plan.
- Prevent duplicate achievements, duplicate emails or repeating first-time animations across reloads and sync races. Persist plan and award identifiers. Never store raw cached Strava-only measurements indefinitely; respect provider restrictions.
- Separate lifecycle status from achievement: Active, Training Complete, Race Pending, Race Completed, Recovering, Recovered, Archived; do not infer from date alone.

## 3. **NEW** Post-race Recovery Plan

### Entry conditions
- Trigger offer after **confirmed race finish**. Also allow manual recovery start if the runner completed an event outside their saved training plan.
- Recovery is a real, first-class state in Home, Plan and calendar, not just explanatory text or generic workouts.
- The goal is **restoring readiness**, not training load or adherence streak. A rest day counts as following the plan, not a missed workout. No penalty or nagging for skipping.

### Inputs
Race type/distance (5K, 10K, half, marathon, 56K, Comrades/other ultra), finish date, effort (easy / hard / all-out), experience, previous average weekly km, notable symptoms, fatigue/soreness/sleep, the runner's preference for rest/walk/cross-training. Make inputs optional where possible and explain missing data. Use day-local dates, never UTC comparisons that shift a race date.

### Illustrative windows (defaults for planning, **not** a promise of safe return)
| Race | Initial recovery framing | Default approach |
|---|---|---|
| 5K | 2–4 days | Rest, walk, optional easy short running once comfortable |
| 10K | 3–7 days | Very easy movement, gradual running |
| Half marathon | 7–14 days | Low-load first week; cautious easy running thereafter |
| Marathon | 2–4 weeks | Deload with gradual easy return; no early quality work |
| Ultra / Comrades | Individualised, often several weeks | Conservative rest/rebuild based on duration, terrain, exertion and symptoms |

These are **editable orientation ranges** for healthy runners, not fixed medical prescriptions. Add conservative defaults, never automatically generate mandatory hard workouts. If there is severe or persistent pain, inability to walk normally, marked swelling, dark urine, fainting, chest pain or other concerning symptoms, recommend prompt medical attention; do not generate exercise instructions over those warning signs.

### Generator
- Add an independent recovery template/generator and version (do **not** mutate v1/v2/v3 race-plan outputs or snapshots).
- Start with an optional full rest phase, then low-load easy movement, then easy re-entry. Permit walking, rest, gentle mobility, optional easy run and (when appropriate) light cross-training. No tempo, intervals, hard strength, long runs or performance tests early.
- Show qualitative targets (e.g. 'short conversational effort') with optional personal time/distance ranges; never use race-goal pace to prescribe recovery.
- Respect run days, time availability, individual recovery status, recorded symptoms and the runner's explicit choices.
- Use readiness check-ins before progression: 'Good to go', 'Still sore', 'Very fatigued', 'Pain or injury', and 'Not sure'. If not ready, repeat/ease recovery, don't escalate. Never auto-schedule missed sessions into later days.
- Support pause, skip, edit, early end, extend, and restart recovery; revision-safe persistence and clear history.
- Strava imports are evidence of movement but **do not** automatically indicate readiness or unlock harder workouts.
- Deload/maintenance after recovery should be distinct from the next race plan. Show 'Keep running comfortably' and 'Train for another race' as equal choices.

### Example half-marathon user journey (illustrative, individualise)
Day 0: celebrate race, hydrate/eat/rest, ask how they feel; no compulsory workout.
Days 1–3: optional rest/short walk, no training target; symptom-aware check-in.
Days 4–7: if comfortable, short easy mobility or runs/walks; otherwise continue rest.
Week 2: optional easy conversational running on fewer days than normal, gradual duration, no forced return to pre-race volume.
Ready state: runner chooses maintenance or next goal. Do **not** interpret the schedule as clearance to train.

### Recovery Home state
Instead of 'Next workout: intervals':
'Recovery day 3 · Rest is training' with Runner sleeping, a nonjudgmental check-in, the next optional easy activity and a 'How I'm recovering' trend.
Give recovery its own progress language: days since event, wellbeing and next safe optional step, not a training completion percentage.

## 4. Next challenge / retention
- After recovery: two paths:
  1. **Maintain fitness**: flexible 2–4 easy sessions/week (as appropriate), strength optional, no forced race date or hard sessions.
  2. **Choose a race**: return to existing builder, prefill prior preferences where appropriate, suggest achievable next goal based on verified history, never manufacture predictions.
- An explicit 'Not ready yet' path always exists.
- Provide optional email/push notifications only with existing permissions, no unsolicited new marketing campaign; avoid nagging injured runners. No duplicate once-off emails.

## 5. Existing source integration touchpoints

- `client/src/features/plan/PlanView.tsx`, `PlanProgress.tsx`, `plan-day.ts`: lifecycle and page placement.
- `client/src/features/plan/FinishLine.tsx`, `finish-line-model.ts`, `finish-line.css`: **first frontend slice already committed** in #262. It currently uses device-local once-seen state, supports a simple SVG card, and counts planned distance of confirmed sessions. This is **not** yet account-backed history, real distance, polished film, or recovery.
- `client/src/features/shared/Runner.tsx`: original animation identity; preserve.
- `client/src/features/coaching/useCheckIns`, `strava-completion.ts`, `docs/strava-sync.md`: distinguish durable manual completion and ephemeral synced runs. Skipped/CutShort must never count as full completion.
- `src/StartLine.Domain/Plans/SavedPlan`, `docs/plan-history.md`: current versus archived; no My Plans screen at present.
- `client/src/features/plan/RaceWeek.tsx`: currently has post-event advice but not an actual recovery flow.
- `docs/flexible-training-week.md`: current recovery-readiness coaching is for adjusting a *live* training plan, not post-race recovery.
- Existing builder plan versions and snapshots must not be modified in place.

## 6. Backend/API and persistence design proposal

Implement resource ownership and versioned, authenticated CRUD with migration and contract tests:
- `GET /me/plan-journeys` includes current/archived plans and achievements, paginated and filtered to current runner.
- `GET /me/plan-journeys/{id}` includes recap and data-confidence/source metadata.
- `POST /me/race-results` + update/delete with optimistic concurrency/idempotency and careful activity association.
- `GET /me/recovery-plans/current`, `POST /me/recovery-plans`, `PATCH /me/recovery-plans/{id}`, `POST /me/recovery-plans/{id}/check-ins`; consider explicit complete/pause/resume endpoints.
- Make race result, badge award and recovery-plan creation idempotent across retries, devices and webhook duplicates.
- All endpoint names are **design proposals**, not existing routes. Avoid schema/API drift and regenerate client types.

## 7. Acceptance criteria

### Completion and data
- [x] Training ended yesterday but zero workouts confirmed: **no earned full-training badge**. *(TrainingRecap domain tests, journey-model and JourneyPanel tests)*
- [x] All eligible runs confirmed while race tomorrow: training celebration, **no race finisher badge**, pre-race guidance. *(JourneyPanel test, browser journey)*
- [x] Some days missing, skipped or CutShort: recap truthful, counts correct. *(TrainingRecap domain tests)*
- [x] Ephemeral Strava match expires: no permanent completion award; confirmed check-in still persists. *(Strava never counts as confirmation or recorded distance; domain tests)*
- [x] Existing already-completed plan: recap and animation eligible on first visit, including archive when implemented. *(retrospective award integration test; past plans replay from Running journey)*
- [ ] Multiple plans, replan/move run, deleted/recovered workouts: stable keys, correct totals and no duplicate badges. *(partial: unique indexes and idempotent award sync tested; replan and moved-run recaps not specifically tested)*
- [x] Race past with no actual race result: request confirmation, no assumed finish. *(Home no longer says "Race complete" from the date)*
- [x] No recorded distance or pace data: 'not enough evidence', never invented measurements.

### Recovery
- [x] After confirmed half marathon: optional recovery offer; appropriate default, adjustable and symptom-aware.
- [x] User declines: Home remains useful, no unwanted recovery session creation.
- [x] Still sore/pain: do not progress load or show high-intensity sessions. *(RecoveryGenerator ceiling tests)*
- [x] No planned hard training during recovery; no punishment for rest. *(generator never emits pace, intervals, tempo or long runs; 45-minute cap)*
- [x] Race on different date/time zone: recovery dates align with local race date. *(local DateOnly throughout; DST boundary domain test)*
- [x] Ultra progression conservative and personalised; clear seek-care safety state.
- [x] Returning from recovery: maintenance and next-race options both work, no data loss. *(next race opens the existing builder, which asks before replacing a saved plan)*
- [x] Anonymous mode explicitly explains device-local limitations.

### Experience/QA
- [ ] Responsive on 320/375/768/1024/1440 widths, phones, desktop and installed PWA. *(partial: all widths verified in Chromium; installed PWA and physical phones not tested)*
- [x] Light/dark themes retain contrast; approved Night Run look unchanged. *(axe WCAG 2.2 AA at every width in both themes)*
- [ ] Reduced motion, keyboard, screen reader, focus restoration and Escape dismissal. *(partial: reduced motion, keyboard, focus trap/restore and Escape verified in Chromium and WebKit; no manual screen-reader pass)*
- [ ] Share/copy/download on Safari/iOS, Chrome and supported PWA, with failures handled. *(partial: PNG download verified in Chromium; native share sheets need a real device)*
- [ ] Refresh, sign out/in, reconnection, concurrent tabs and duplicate API requests behave safely. *(partial: duplicate and concurrent API requests tested; failed refresh keeps the last journey; cross-tab refresh not tested)*
- [ ] Unit/integration/E2E including legacy plan, custom start date, moved run, provisional Strava and signed-out view. *(partial: all except moved run)*
- [ ] Run `scripts/check.sh` with disposable test services, then Playwright visual QA before any merge; never test against production data.
- [ ] Merge to staging first; review real screens with before/after screenshots, then only merge to prod when verified.

## 8. Implementation phases and handover

1. **Finish existing PR slice safely**: resolve type/lint issues, correct race/training eligibility, evaluate every training completion event, accessible animation/modal and download/share tests. Do not claim coverage until run.
2. **Durable account history**: backend lifecycle, archived plan browse, achievement portfolio and retrospective award; migrations with ownership and idempotency tests.
3. **Race confirmation and analysis**: manual/recorded race result, post-race badge and performance analysis.
4. **Recovery engine + UX**: distance-aware conservative templates, readiness check-ins, Home/calendar/Plan integration and explicit user choice.
5. **Maintenance + next-goal transition**: keep running or build a new race plan; preserve journey.
6. **QA/staging/prod**: full checks, screenshot evidence, no regressions in sign-in, Strava, PWA, move-run, plan generation, accessibility.

Do not merge simply because a PR exists or tests are written. Code-implement and verify every checkbox; clearly record any deferred scope and test limitations.


## 9. Calendar boundaries: scheduled rest vs outside the plan

**Reported bug:** after the plan ends, remaining dates in the visible month and the tail of a final week show as "Rest day", although no training prescription covers those dates.

**Correct contract:**
- **Within the plan's actual start/end dates and no workout:** Rest day; this is an intentional calendar gap in the training schedule.
- **Before start or after finish, no scheduled session:** Outside this plan; visibly neutral/unmarked, never a rest day or missed workout. Still allow the runner to open the date and see activity history if any.
- **Race day:** Keep the race-day marker, distinct from both rest and a training completion milestone.
- **After race confirmation:** If an optional recovery programme is created, paint recovery/rest/optional-movement days **only from that recovery plan's own dated sessions**, with an explicit Recovery label. Do not retroactively fill the rest of the calendar with inferred rest days.
- **Out-of-plan recorded activity:** Show the actual activity marker; do not claim it was prescribed or make it a fake rest day.
- **Moved runs, custom start and race dates, shortened/replanned schedules:** resolve status from authoritative plan boundaries and actual sessions; never classify merely from absence of sessions.

**Initial fix already committed in this PR:** `training-status.ts`, `PlanView.tsx`, `PlanCalendar.tsx`, `WeekGlance.tsx`, `DayPreview.tsx`, `plan-journey.css` and corresponding training-status tests. Needs test execution and real visual verification.

**QA:**
- [x] Plan ends mid-month; remaining days are neutral "Outside this plan", not rest.
- [x] Final week extends beyond race day; dates after race are outside.
- [x] Real rest days between training sessions retain Rest status.
- [x] Recorded independent run after plan end remains visible as recorded activity.
- [x] Before custom start date, dates are outside; no invented early rest.
- [ ] Mobile/desktop, light/dark, calendar and day detail labels agree. *(partial: month calendar, week strip and day preview labels tested; the full day-detail page for an outside date not checked in a browser)*
- [x] When recovery plan is implemented, only recovery sessions carry recovery/rest labels.
