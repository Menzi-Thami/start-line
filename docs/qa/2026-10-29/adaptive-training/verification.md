# Adaptive training verification

All accounts, plans, runs and push addresses are synthetic. SQL uses the disposable `TaperdayAdaptiveTests` database on the local Docker server. No production database, real Strava account or real push service was used.

Browser verification uses the actual React components with synthetic API responses:

- Weekly review, remaining-week preview, Account reminders and Home confirmation fit 375, 820, 1440 and 2560px (16 layout checks), with no horizontal overflow or page errors.
- Keyboard Enter opens the weekly review after selecting recovery. The browser uses reduced motion; the standard browser suite also verifies global reduced-motion controls and keyboard chart navigation.
- New reminders default to 06:00 and include recovery/strength days. Existing device preferences are preserved.
- A synced unplanned run shows a confirmation action, not the first-run empty state. Logging opens the actual run date and defaults to additional, leaving the prescribed workout outstanding.
- Linking that run adds one saved run without inventing permanent distance. Entering an independent 10 km measurement keeps the association, updates saved totals to 10 km and keeps the weekly card at 10 km. It is not counted twice.
- Unit tests also cover different independent/provider distances: a 12 km own report associated with a 10 km provider run counts as 12 once, including after the cached run disappears.
- SQL integration tests cover read-only previews, exact/stale fingerprints, ownership, local midnight, reopening, calendar/check-in consistency, Sunday acceptance without historical pace changes, independent measurements after activity removal, daily worker scheduling and repeated/unplanned Strava sync notifications.

The PNGs beside this report show the real components with synthetic data. Physical iOS/Android notification delivery and production VAPID/hosting settings remain deployment/device checks. App Service availability and the phone can delay 06:00 delivery; SQL Basic alone does not keep the API worker awake.
