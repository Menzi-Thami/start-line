# Recording actual running

A planned session remains identified by its original date and type. A check-in may additionally record the actual run type, distance, duration, effort and pain. This does not change generator inputs or replace the original workout.

Complete opens quick logging. The runner may enter distance and time, time alone, link an imported activity, or explicitly complete without details. Time alone sets `DistanceUnreported`; do not substitute planned kilometres. Complete without details has no recorded time and may use the planned distance as an explicitly labelled estimate.

Additional runs have independent, client-generated entry IDs and `IsAdditional=true`. The original date/type uniqueness constraint applies only to planned-session check-ins. Additional entries cannot complete a planned workout, suppress its notification, or become evidence that its prescribed hard work was done. Repeating a save with the same additional entry ID updates it rather than adding another run.

Imported activity links store an activity ID, not a copy of the imported metrics. Validate ownership, visibility, date and uniqueness before saving. The same import cannot be linked twice within a plan. Strava metrics retain their existing seven-day cache boundary; cached activity details disappearing does not turn them into a permanent manual distance. Independently entered manual data remains the runner's own record.

Weekly plan charts include current imported activities and manual check-ins. A recording and the same day's ordinary check-in count once; an explicitly additional manual run contributes separately. Long-term totals retain their existing uploads/manual-only policy. Strength never counts as a run.

Logging cannot silently accept a coaching change. The proposal endpoint builds a preview without saving a weekly call. Applying requires the reviewed proposal's fingerprint; stale proposals are rejected. Reminders and opening a plan use already accepted calls. Proposals that would change workouts on past dates or already completed today are not offered for application. Use Replan from here for a midweek rebuild starting next Monday. Previous weeks and historical generator versions remain intact. Easy substitutions cannot be credited as easier-than-expected hard work or used to speed up training paces.

Run stickers render entirely on the device. Use actual distance/duration only, calculate pace only when both are known, and keep unknown values visibly unknown. The PNG has transparent margins and contains no account name, GPS route or account/calendar secret. Strava stickers identify Strava as the source. File sharing and image copying are user-triggered; Save PNG is the fallback when native sharing or clipboard support is unavailable. Physical-device Instagram behavior must be verified separately.

The `ActualRunLogs` migration adds nullable actual-type/activity-link fields, two flags with backward-compatible defaults, and filtered unique indexes. It does not rewrite generated plans. Do not downgrade a database containing additional entries without reviewing their preservation: the older uniqueness constraint cannot represent multiple entries for one date/type.
