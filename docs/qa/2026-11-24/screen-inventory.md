# Screen and call-to-action inventory — 24 November 2026

Read from source at `8918f89` (client/src). This is a **static** inventory: it says what the code can show and where each control goes. It is not a rendered pass. Paths are relative to `client/src`.

## How navigation works

No router library. `view` comes from `?view=` (`app/App.tsx:117-124`), changed with `pushState` (`moveTo`, `app/App.tsx:524-528`) and restored on `popstate` (`:668-692`). `/strava/callback` maps to `account`; `?view=plans` to `journey`; anything unknown (including `?view=plan` used by some pushes) falls back to `build`, where the landing effect opens the runner's own plan.

| `view` | Renders | Source |
|---|---|---|
| `build` (default; plan links `?race=&goal=&days=&long=…`) | BuilderForm, PlanView, PlanLocked, plan error, FindingPlan, "Checking your session…" | `app/App.tsx:1097-1268` |
| `home` | Home | `:993-1020` |
| `beginner` | Couch to 5K with "← Back" | `:1023-1028` |
| `runs` (`&run=`, `&returnTo=`) | MyRuns / ActivityPage (split on desktop) | `:1034-1057` |
| `journey` (`section=training\|races\|cabinet`, `chapter=`) | JourneyPage | `:1030-1032` |
| `recovery` (`race=`) | RecoveryPlanPage | `:1033` |
| `account` (`settings=profile\|connections\|notifications\|data\|shoes`) | AccountPage | `:1059-1075` |
| `onboarding` | StravaWelcome | `:946-948` |
| `privacy`, `unsubscribe` (`t=`, `list=weekly`) | public pages, also before sign-in | `app/AppAuth.tsx:25-33` |
| `sign-in` | transition text, then plan or Home | `app/App.tsx:944-945` |
| `sign-up` (internal, not URL-addressable) | "Finish signing up" + ProfileForm | `:975-987` |

Plan sub-state: `planTab=week|all|strength|progress`, `day=`, `planWeek`, `month`, `progressWeeks`, `prepare=race|long&date=` (`features/plan/PlanView.tsx`). Runs filters: `range`, `source`, `tab=tools`.

## Main navigation

Bottom bar below 64rem, left rail above (`app/TabBar.tsx:24-30`): **Home, Plan, Runs, Journey, Account** (Account shows the runner's photo or initials). The bar is hidden on `onboarding` and while the build film plays (`app/App.tsx:825-827`). Plan is hidden unless the runner has a plan, is on a plan, or is in recovery, easy running, `recovery` or `beginner` (`:1280`).

| Tap | State | Goes to |
|---|---|---|
| Plan | on Couch to 5K, no race plan | **nothing happens** (`app/App.tsx:538`) — defect D-10 |
| Plan | no plan, in recovery or easy running | `recovery` |
| Plan | already on a plan | This week, day cleared |
| Plan | otherwise | own plan This week, else linked plan, else builder |
| Home / Runs / Journey / Account | any | that view |
| Wordmark | any | Home when ready, else builder |

Masthead: theme toggle on every route; footer: Send feedback (signed in), Privacy policy, email. "Skip to main content" always.

## Tabs and sections

- **Plan:** This week · Calendar · Strength · Progress (tablist, arrows and swipe). Strength is its own tab (PR #314). "Add/Change strength days" opens the plan wizard summary, like Edit plan.
- **Progress:** Weekly review (own plan), 4/8/12 weeks, More detail, Training paces, Pace table.
- **Couch to 5K:** This week · Calendar · Progress, "All 9 weeks", pause/resume, repeat week.
- **Journey:** Training chapters · Races & trophies.
- **Account:** Profile (More › Shoes) · Connections · Notifications · Data & privacy · Sign out.
- **Runs:** Add runs sheet, Filter (range, source), Share a milestone, Running tools (Pace, Race times, Splits, Heart rate, Fuelling); list or run detail on phones, split view on desktop.

## Sign-in and account states

Production mounts `App` only after `SessionGate` (`app/AppAuth.tsx:14-50`) has a session and an account. So the signed-out branches inside `App.tsx` (SignUpPitch, masthead Sign in/Build a plan, App-level SignInLanding, signed-out prompts, PlanLocked "Create a free account", "Sign in to save this plan", "Sign in to save your result") are **not reachable in production**. They only run in non-production builds with accounts off.

| Screen | When |
|---|---|
| "Connecting your account" (+ "Reload Taperday" after 12 s) | auth loading |
| SignInLanding "Your next run starts here." | no account, any non-public URL incl. shared plan links (URL kept through the redirect) |
| "Continue securely." renewal | account remembered, session not ready |
| "A bit about you" / "Finish signing up" | first sign-in (API 404 for runner) |
| StartListCelebration, StravaWelcome | right after sign-up |
| PrivacyUpdate | new privacy version; blocks all but privacy, account, unsubscribe |
| FindingPlan / SignInWait / AccountRecovery | account loading slowly or failing (PR #316 owns these) |
| "Checking your session…" | build view with `awaitingSavedTraining && auth.loading`; since the gate waits for auth, likely unreachable in production — to confirm on #316 |

## Dialogs and confirmations

Move run (dialog; Cancel, Move run/Swap runs, Undo/Done, ×, Escape); day detail page ("← Back to plan" and ×); post-run rating (two taps, Save as planned, Not now, More details); check-in form; run log; adaptation prompt; Change my plan (Missed a run, Short on time, Travelling, Feeling unwell, Week off track, Rebuild from today); replan banner; Add to calendar; Export to watch; run sticker; finish-line film (dialog); install guide (dialog); date picker (dialog). Inline confirms: delete plan, replace plan, delete account, delete uploaded run, disconnect Strava, undo race result, remove race memory, archive chapter, end recovery, stop easy running.

## Deep links

| Link | Signed out | Signed in |
|---|---|---|
| `?view=privacy`, `?view=unsubscribe&t=…` | public page | same |
| shared plan `?race=…` | SignInLanding, link kept | builds plan; "Update/Replace my plan" bar if not the saved one |
| `/strava/callback` | gate first | Account or onboarding with a connected/not-connected notice |
| `?view=runs&run=<id>` (run arrived push) | gate | that run |
| `?view=home`, `?view=home&review=1` | gate | Home / Plan › Progress weekly review |
| `?view=plan&prepare=race\|long&date=` (push) | gate | falls to `build`, then own plan |
| `?view=account&settings=connections\|shoes` | gate | that group |
| `?tick=date.Type` | gate | NotificationTick card (no producer in `src/` found) |
| calendar feeds | API: `/api/v1/plans/calendar.ics?…`, `/api/v1/calendar/{token}.ics` | |

## After the race

Race week panel (film, training story, result form: I finished / I didn’t finish / I didn’t start / I’ll add it later) → CHAPTER SAVED (View my training chapter, Open recovery plan) → recovery (Start my recovery, check-ins, I feel recovered) → next chapter (Keep running comfortably = easy running, Train for another race = blank builder, I need more recovery, Not ready to choose yet). Home shows "Open easy running" / "Train for another race" while easy running is on.

## Things that look wrong (tracked in the defect ledger)

| # | Where | What | Ledger |
|---|---|---|---|
| 1 | `app/App.tsx:538` | Plan tab does nothing on Couch to 5K without a race plan | D-10 |
| 2 | `features/journey/RecoveryPlanPage.tsx:69-70` | copy says Races & trophies, button opens Training chapters | D-11 |
| 3 | `features/journey/RaceResultForm.tsx:215` | "Undo" on a saved result starts removing it | D-12 |
| 4 | `JourneyHomeCard.tsx:38`, `JourneyPanel.tsx:187`, `app/App.tsx:1213` | "Start recovery plan" only opens the page; JourneyPanel drops the race id | D-13 |
| 5 | `features/sync/StravaWelcome.tsx:31` | "Continue to my plan" lands a new runner on an empty builder | D-14 |
| 6 | `features/activities/PhoneRunGuide.tsx:21-22` | says use "Log a run" in your plan; button opens the week, Log a run is in day detail | D-15 |
| 7 | `app/App.tsx:989,1023,946` | `?view=beginner` / `onboarding` while the account loads renders an empty main | D-16 |
| 8 | `features/journey/JourneyHomeCard.tsx:40-43` | brand-new runner sees post-training "Ready when you are." / "Choose my next challenge" | D-17 |
| 9 | Home | today's run reachable by both "Open run details" and "View run"; "Open today’s workout" and "View this week" both go to This week | noted, keep-simple review |
| 10 | Plan | three overlapping "ease this week" flows (Week off track, adaptation prompt, weekly review) | noted, owner call |
| 11 | props never passed: `Hero` `lede`/`onSignIn`, `JourneyPage`/`JourneyPanel` `onNewRace`, `TrainingStory` `onNext`, `PlanView` `progressInBar`/`openTab`/`onTabChange` | dead code, not user-visible | noted |
