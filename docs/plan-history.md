# Plan edits and recorded history

Changing the current plan's answers is an update to training preferences. The runner's recorded date, identity, own distance/time, feedback and imported activity association must survive. Finishing same-race changes saves them before showing the updated plan. A failed edit retains the saved URL so a reload opens the last saved plan; retry is safe. A new race still requires the existing explicit replacement flow.

Same-race form changes retain the original build date, generator version and replan metadata. A historical custom start remains valid when availability changes. Choosing a new start is allowed; earlier logged runs remain visible above the plan and accessible in the monthly calendar. A session no longer prescribed on its original day appears as a logged run, rather than disappearing or moving to a new date.

`SessionCheckIn.PrescribedKm` is a nullable snapshot of the plan's own prescription, not an actual measurement or copied provider data. New planned completions capture it; same-race updates capture missing legacy baselines before changing inputs. It never replaces manual distance and does not turn missing Strava measurements into actual distance. Capturing bookkeeping alone preserves the check-in's answer timestamp. Saved totals use this baseline for plain completions so later training changes cannot rewrite their estimated distance.

An existing saved run remains editable even if its old date/type is no longer in the generated schedule. New check-ins still require valid prescribed sessions; new additional entries still require a date within the plan. Existing additional entries can be corrected after a later start moves them outside that window. Ownership, active-plan status, source associations, positive distance/time and duplicate-link checks remain enforced.

Removing a plan with check-ins archives its schedule, preserving recorded history and totals; removing a blank plan deletes it. Deleting the account still removes personal data. Archived plans remain read-only for adding/editing check-ins, and the current app does not offer a past-plans browser.

Strength workouts and the exercise library use collapsed summaries. A summary shows date, exercise count and set progress; opening reveals exercises. Closing or changing tabs preserves device-local set ticks. Printing opens workout instructions and restores collapsed strength sections afterward. Strength completion stays separate from running.

Time-wheel keyboard fields become visible on focus, so replacing a selected time works reliably and the typed number remains visible. Delayed wheel events merge with the latest duration instead of overwriting another edited field.

## Limits

No operation reconstructs a run already physically deleted by an older release, or an original legacy prescription that was overwritten before a snapshot could be captured. Retained manual measurements and check-ins can be shown again; old backups would be needed for actually deleted records. Strava still follows its existing temporary-cache availability: own logged values and completion identity remain, but expired imported measurements are not copied into permanent history. Strength progress is still local to the device.
