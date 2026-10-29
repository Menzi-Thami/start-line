# Daily PWA reminders

Reminders are opt-in for each device in Account. New devices default to **06:00 in the runner's profile time zone**, including recovery and strength days. Existing devices keep their chosen time and run-day-only preference; opt into the new setting in Account. The optional Monday summary remains available. Reminders run only between the current plan's start and race date.

Recent Strava activities receive one **Nice work — run finished!** notification per actual run, including rest-day runs and substitutions. Tapping opens the actual run. It never completes the prescribed workout automatically. The sender atomically claims an activity before sending, preventing repeated webhook/update/refresh notifications and concurrent duplicates. Each different run can be congratulated. Runs over two days old and future-dated activities are quiet. The marker belongs to the cached activity and disappears with it. Default messages contain no run metrics; the existing `Push__IncludeRunData` boundary remains in force.

New notifications open the actual run instead of offering a quick Tick it action. Signed actions on older delivered notifications remain compatible. Manual logging provides immediate in-app feedback.

## Delivery requirements

- HTTPS and configured VAPID keys, as in [deploy.md](deploy.md). Keys are never stored in the repository. Without configured keys, reminders stay hidden.
- iPhone/iPad needs iOS/iPadOS 16.4+, Taperday installed on the Home Screen and opened from its icon, and notification permission granted from the runner's action. An ordinary iPhone browser tab cannot subscribe. Supported Android/desktop browsers also require permission.
- The app need not stay open. Focus modes, battery policies, offline devices, network and push services may delay delivery.
- **Azure SQL Basic does not keep App Service F1 running.** The existing worker sleeps until the next due time and never polls SQL, but its API process must be running. F1 may sleep or exhaust its own quota. A liveness ping is best effort, not an exact 06:00 guarantee. Reliable server scheduling needs supported always-on API hosting or a separately scheduled sender; this PR does not provision or purchase infrastructure.
- A reminder missed during sleep is sent later that same local day; a completely missed day is skipped. Devices are marked before sending, preferring a missed delivery to duplicates after a crash.

Tests use fake push/Strava services and disposable SQL only. Production VAPID settings and physical iPhone/Android delivery still require deployment/device verification. No test sends a real notification or calls real Strava.
