# Training that reflects what happened

Log actual runs as a replacement for a prescribed workout or as an additional run. The prescription stays visible. Synced activities offer **Log this run** in the calendar and Home explains when an imported run has not yet been confirmed. Linking an import does not copy cached metrics into a permanent record. Choosing Enter manually starts empty fields for the runner’s own measurements. The `independentMetrics` request acknowledgement permits those self-reported values to retain an activity identity association, preventing double counting. Their own values remain after the imported cache disappears. No imported measurements are prefilled or copied.

Time-only and linked entries count towards the number of saved runs. Their distance remains unreported, rather than being replaced with the prescribed distance. The running-log API retains its numeric distance contribution and adds `distanceUnreported`; when true, zero contributes nothing to distance sums and must not be presented as a zero-distance run. Home shows a dash when no distance is known and explains partial totals. The four-full-week average excludes the current week.

## Remaining week

Home and Plan offer **Review and adjust training → Preview the rest of this week**. The runner first confirms that their actual runs have been logged; a missing check-in alone is not proof of a missed run.

The optional conservative reset changes dates after the runner's local today and before next Monday. It never moves missed sessions, adds days or increases kilometres. Upcoming runs become easy, at most 8 km and no longer than prescribed. Manually reported distance and uploads cap the remaining distance against the original week's budget. Pain that changed running, or an already completed weekly distance budget, suggests rest. Strength, today, earlier workouts, future weeks and the race remain unchanged. Race week is left as written. Illness, injury and longer breaks still use **Replan from here**; the UI recommends rest and professional advice for pain.

A preview never saves. Apply recomputes and fingerprints the reviewed evidence, local date, saved rowversion, accepted calls and original inputs. New check-ins/uploads, midnight or a concurrent plan edit require a fresh preview. Repeating a review with unchanged evidence does not progressively shrink the plan.

Accepted revisions are compact JSON, one per date, with the original title/type/distance, accepted easy distance or rest, and the accepted easy pace range. Later pace changes cannot rewrite those historical steps. Saved plan reads, check-ins, activity matching, personal calendar feeds and reminders apply the same overlay. Account export includes it; deleting the plan deletes it. Anonymous links remain the original generated plan.

## Weekly review

On Sunday, the review covers this week for next Monday. From Monday, it covers the week just finished. It summarises logged, skipped and unrecorded sessions, substitutions, reported distance and unknown distances. The runner states whether they feel ready, tired, unwell or prefer not to say. Outstanding Sunday logs must be completed or explicitly marked skipped before applying next week's proposal.

New coaching decisions require three consecutive strong weeks, complete evidence, known distance and positive recovery before progressing workout difficulty or speed. Substitutions, additional runs, niggles or missing evidence prevent escalation. Planned distance growth cannot also increase workout difficulty and speed. Recovery/cutback/taper weeks are protected; race week is not rewritten. Pain takes priority even when there are few check-ins. Tired and unwell answers ease training. The existing generator still enforces its 10% ceiling and all other rules.

Sunday acceptance affects upcoming sessions, while today's zones and historical workouts retain their correct paces. Ordinary plan reads and reminders only read accepted decisions. Both historical generators and existing accepted calls retain their meaning. Suggested faster race goals still require a separate runner decision.

Lasting coaching uses self-reported check-ins and uploads only, never cached Strava metrics. This PR does not change Strava retention. Test only with synthetic data and disposable local SQL: [testing.md](testing.md).
