# Private prescription import and operations

This is a public repository. Use only the synthetic sample here. Keep real identities, schedules, source JSON, mapped files, responses, tokens, screenshots and logs out of Git, CI, issues and PR comments. Do not enable the pilot or activate a real plan without the owner's approval.

## Enable an approved runner privately

The additive migration adds `Runners.PrivatePrescriptionsEnabled` with default **false**. No client/profile request can set it. An authorised operator can enable the approved account through a parameterised, private database operation using that account's verified runner ID:

```sql
UPDATE Runners SET PrivatePrescriptionsEnabled = 1 WHERE Id = @RunnerId;
```

Do not put an actual ID in a script or this document. This change is not performed by the PR. Revoking entitlement prevents new imports/activation; existing owner history remains readable/exportable/deletable. The server binds every operation to the authenticated subject, never to an imported runner ID.

## Map a privately supplied file

The API accepts one explicit version-1 schema, rejects unknown/duplicate fields and numeric enums, and bounds imports to 512 KiB. Mapping happens locally in the owner's trusted environment **before** authenticated preview. Do not upload source files to this public repo for conversion.

Generate the entirely synthetic example for inspection:

```bash
node scripts/private-prescription-sample.mjs /tmp/synthetic-private-prescription.json
```

Its dates belong to the isolated test clock (8 October 2026), not an activation request for anyone. For a real import, use the authenticated runner's local date for `baseline.planFrom`, an explicit `startOn` on or after that date, a custom race snapshot within one year and at least the generator's minimum lead time. Do not reuse the test dates on a live account.

| Proposed source concept | Final field / mapping |
|---|---|
| Title / plan name | `name`, 1–100 characters |
| Race / goal / experience / current mileage | `baseline`, the existing GeneratePlanQuery fields. Use `raceName`, `raceDate`, `distanceKm`, `goalTime`; omit `raceSlug`, replan and ownership fields. Pin generator `version`. |
| Workout date and identity | `prescription.sessions[].date` (local ISO date) and a unique UUID `id`. At most one run and one gym per date. |
| Run type / RPE / notes | Named `type` from SessionType, `targetRpe` 1–10, optional `notes` ≤1000 characters; never infer RPE from Strava. |
| Warm-up / work / recovery / cool-down | Separate `steps` with named `kind` (`WarmUp`, `Run`, `Recover`, `CoolDown`). Each leaf has exactly one of `distanceKm` or `durationSeconds`, `zone`, explicit ordered `fastestSecondsPerKm`/`slowestSecondsPerKm`, `times: 1`, `steps: []`, optional `effort`. All parts contribute to total distance. Do not add a conflicting supplied total. |
| Repeated intervals | `kind: "Repeat"`, `times: 2..30`, nested `steps` (1..16); no measurement, zone or pace on the repeat container. At most two repeat levels. |
| Pace zones | `prescription.paces`, exactly one of Recovery/Easy/LongRun/Tempo/Interval/Race; finite ordered 90..1800 seconds/km. Session and step zones are explicit. |
| Upper/lower gym | `type: "Strength"`, `gym: "Upper"` or `"Lower"`, `durationMinutes: 5..120`, `targetRpe`, `steps: []`, optional instructions in `notes`. No running zone or distance. At most four gym sessions per Monday–Sunday week. Lower-body cutback/taper/race-week work must have `reducedLoad: true` and RPE ≤5. No race-day gym. |
| Rest / race exceptions | Omit sessions for full rest. Include exactly one `Race` on the race date with the exact race distance; nothing after race day. A Saturday race and Sunday long runs are supported. Race-week running before the race is capped at half the preceding week's running. Consecutive hard running days are refused, including Sunday/Monday. |

`prescription.schemaVersion` is **1**. There are 1–800 sessions, 1–32 steps per run, at most 100 km per complete run and 300 km per week. JSON numbers must be finite. Null, invalid, out-of-range or structurally inconsistent inputs fail without changing the current plan. Upper-body instructions can be supplied in notes; this pilot does not invent exercise routines from an unfamiliar source schema.

## Owner preview and explicit activation

Sign in as the enabled runner → Account → Data & privacy → Private prescription. Choose the mapped JSON file. Preview shows race, dates, weekly totals, every run/gym and recursive workout steps/pace bands. Check the explicit consent box, then **Make prescription current**. Cancel leaves the current plan intact. The app sends file contents and preview token only in authenticated request bodies; neither is put into URLs or storage.

API sequence for an authorised private client:

1. `POST /api/v1/me/private-prescriptions/preview` with `{ name, baseline, prescription }`.
2. Review the returned `plan`, `replacesCurrent`, `importId`, `expiresAt` and opaque `token` privately. The draft is valid for 30 minutes and only on the reviewed local day. Up to five unactivated live previews are retained per account; older unactivated expired previews are removed on a subsequent preview.
3. `POST /api/v1/me/private-prescriptions/{importId}/activate` with `{ "token": "<private preview token>", "consentToReplace": true }`.
4. Open the returned `planId` through `/api/v1/me/plans/{id}` or Home/Plan. Never build its public baseline to display its workouts.

Activation rechecks entitlement, consent, token, expiry and the expected current plan ID/rowversion. A changed current plan requires a new preview. Archiving the old plan, inserting the new plan and recording the activation receipt are one serializable transaction with the existing SQL retry strategy. The no-current-plan case is protected too. A repeated successful activation returns the same plan ID; it does not reactivate an archived plan or create a duplicate. Lost/uncertain responses can be retried with the same import/token. Never automatically retry by creating a different import.

## Gym, adjustment and export APIs

- `PUT /me/private-prescriptions/plans/{planId}/gym/{sessionId}` with `{ done, effort? }`: own independent persisted gym completion. Future gym cannot be completed. Running check-ins stay on the existing endpoints.
- `POST …/gym/{sessionId}/move` with `{ target: "YYYY-MM-DD" }`: preview. Repeat with the returned `token` to apply. `target: null` previews restoring the original date. Only unlogged future gym within 14 days, before race, on a date without another gym is allowed; weekly cap and lower-body taper are revalidated.
- Existing remaining-week and life-change preview/apply/restore endpoints resolve the private plan. Logged workouts and race are protected. Private missed-run catch-up, exact distance/pace editing and generic regeneration return an explanation instead of substituting generic workouts. Weekly coaching review reports `unsupportedReason`; it never silently accepts a new weekly prescription.
- `GET /me/private-prescriptions/plans/{id}/calendar.ics`: authenticated owner export. Owner-side calendar and watch file downloads use the same prescription. Private ICS events use stable prescription IDs.
- Account export includes private prescriptions, original steps and gym changes/completions; deletion removes them with the account. Private schedule-bearing public subscriptions and push are unavailable; weekly recap email omits the private schedule. Actual recorded-run sharing remains available without prescribed steps/titles.

All paths above are under `/api/v1`, require the existing runner policy and return no-store responses. Other owners' IDs return 404. Anonymous callers receive the existing authentication challenge. The service worker retains only public app assets. Home snapshots and device strength ticks never persist private prescriptions; auth changes clear account-specific caches.

## Migration and rollback

`PrivatePrescriptionPilot` adds a nullable JSON prescription and default-empty gym JSON columns on SavedPlans, the default-false entitlement and the runner-owned PrivatePlanImports table. Existing rows and public generation are unchanged. The filtered one-current-plan index and SavedPlan rowversion remain in force. Import JSON is application data in the protected database; this feature does not log bodies or enable EF sensitive-data logging.

Apply only through the normal approved deployment pipeline. Disable entitlement to stop new imports. **Do not downgrade to an API that lacks the private resolver while private records exist**: old code would reconstruct the generic baseline. Keep the resolver deployed, disable import/activation, preserve records and investigate privately. Do not run the migration's destructive Down against runner history to roll back a UI change. A data-removal operation requires separate approval and a reviewed backup/retention plan.

Staging deployment requires merging #332; the handover requires approval for that merge/deploy. Real owner activation requires separate approval and the private payload. No staging/production changes are performed by these instructions.
