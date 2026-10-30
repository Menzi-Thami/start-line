# Slow Miles review and Taperday improvements

Reviewed 30 October 2026. Sources are public product pages and the two screenshots supplied by the user. Public descriptions establish advertised features; this review did not sign in to or verify Slow Miles’ private dashboard.

| Observation | Taperday response |
| --- | --- |
| A sample week and session explanations make a plan understandable before sign-in. | Taperday already provides anonymous plan generation, workout instructions and pace zones. Keep these visible and focused. |
| The supplied weekly-email example combines race/block context, encouragement and a session list. | Add original phase-specific guidance to the plan, weekly review and Monday push. Email delivery still depends on verified outbound sender setup. |
| The public race-plan page advertises checkpoint splits. | Add a preparation checklist and an even-pace checkpoint table using the runner’s own goal. Preparation pushes link into that view. These are elapsed-time references, not course-adjusted predictions or official cutoff advice. |
| The supplied run-screen example explains planned versus actual training alongside measurements. | Taperday already retains prescriptions beside actual runs, reports partial/extra runs, and provides workout-shape-aware comparisons. Preserve that distinction: a synced run does not silently complete prescribed training. |
| The screenshots advertise Garmin integration and sensor/route views. | Direct Garmin sync is a separate provider integration. Existing Garmin file import remains available. Show measurements only when supplied by the source. |

## Notification changes

Per-device choices cover congratulations, training adjustments ready for review, long-run preparation, race preparation and reconnect alerts. New devices choose these during opt-in. Existing subscriptions preserve congratulations and their morning/weekly choices; new categories remain off until selected. Quiet hours defer eligible events, and stale preparation alerts are skipped. Deferred alerts are checked against the current plan, review and connection before delivery. A review notification never accepts a coaching proposal. No missed-run nudge is added.

## Later priorities

1. Finish the verified email sender, then reuse the phase context with a compact weekly session list and preference/unsubscribe controls.
2. Apply to Garmin’s business developer programme for an app serving runners. Confirm API access, capacity, webhooks and workout export before advertising direct sync.
3. Consider a runner-owned race-results/achievement history after the training and delivery flows are stable.
4. Assess route retention and extra sensor fields as an explicit data-model change. Taperday currently discards GPS tracks after import; this change does not add maps or retain location history.

## Sources

- [Slow Miles home](https://slowmiles.run/): sample week and product overview.
- [Slow Miles race plan](https://slowmiles.run/raceplan): advertised session detail, checkpoint splits and progress features.
- User-supplied screenshots: weekly email and Garmin/run comparison examples.
- [Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/overview/): business application and API access; personal access covers the developer’s own data.
