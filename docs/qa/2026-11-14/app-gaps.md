# Saved-plan durability, offline logging and integration validation

Additional work after PR #263, on the same branch. PR #263 was merged by the owner while this follow-up was underway; this work has not been merged or deployed.

## Implementation

- Catalogue plans retain the resolved name/date/distance. Active plans continue to follow catalogue corrections; archiving freezes the latest known details. Past plans and a missing live listing use their snapshot. The additive migration backfills available database and curated race metadata without overwriting an existing snapshot.
- A legacy plan whose race details were never stored and can no longer be found remains visible with `detailsUnavailable`. Its result and existing achievements are retained; the UI does not invent a schedule, training counts or a fresh award. Such lost original details cannot be reconstructed from activity measurements.
- Recent-result distance, time and date now survive saves, reads, edits, replans and export. Adding/removing/changing that performance enables Save. The generated workouts and generator-version snapshots are unchanged.
- Manual run saves/edits/removals survive offline navigation/reload with explicit device-versus-account status. Stable identities, rowversion checks, conflict review, individual draft discard and per-account/tab isolation protect sync. Drafts from replaced plans remain reviewable. Storage errors and rejected API syncs retain the draft/form. Imported measurements are not copied into the offline store.
- Added four browser-engine/device-profile CI jobs and a read-only staging provider configuration report. The latter reports missing configuration and test-recipient/callback isolation without exposing values or sending anything.

## Sequence coverage

| Sequence | Coverage |
|---|---|
| Catalogue save → archive → remove listing → authenticated reload | SQL/API and application tests; same schedule and race metadata. |
| Current calendar correction → archive | Application checks; active follows correction, archived snapshot stays fixed. |
| Legacy snapshot backfill, retained original metadata, unrecoverable listing | Actual migration data operations and SQL/API checks; no invented award. |
| Recent result → preview → save → new client → strength edit → replan → export → remove result | SQL/API plus frontend Save identity regression. |
| Manual offline save → edit → navigate → reload → reconnect → reload | Hook and light/dark browser checks; one stable entry, retained time/distance/note. |
| Failed sync → retry; lost success response → read acknowledgement | Hook checks; retained draft, no duplicate write for an acknowledged match. |
| Another-device edit/deletion → queued save/delete | SQL version checks and browser-hook conflict choice; newer answer preserved. |
| Edit during sync; late refresh; changed account during token acquisition | Hook checks; pending edit retained and stale account cannot submit. |
| Full/blocked device storage; unsynced removal; replaced plan; cancelled sign-out | Hook/authentication checks; no false save acknowledgement or stranded/lost draft. |
| Native PNG/SVG export and share cancellation | Browser-engine suite; native destination checks remain separate. |

## Results

Final commands, counts and CI links will be recorded after verification of the committed implementation.

## Remaining access

No physical iPhone/Android/iPad or remote physical-device service is connected. Dedicated live Entra/Strava test identities, a test inbox and opted-in test push devices have not been supplied. Live authorization, provider delivery, installed-device offline behavior and WhatsApp/Instagram native destination checks therefore remain **unrun**, not passed by browser emulation. The staging configuration workflow is prepared for the existing staging environment; it has not been dispatched from this feature branch or used to deploy anything.

The validation request for those account/device identifiers is pending. Automated tests continue to use synthetic accounts and disposable local SQL. See [the live verification matrix](../../integration-validation.md).
