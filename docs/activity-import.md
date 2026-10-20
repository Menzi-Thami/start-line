# Activity import (Garmin .fit)

Runners upload a run from their watch and see it against their plan. It's free all the way: Garmin's own developer
API is business-only (and closed to new applications), so the route is the file Garmin Connect already gives every
user. Runners on Strava can instead connect it once and have runs arrive by themselves, under Strava's stricter terms
(see "Strava's terms" below and `strava-sync.md`). Both go through the same analysis below.

Taperday reads **`.fit`, `.gpx` and `.tcx`** files, and the zips they come in. Nearly every watch and app exports one of
these: Garmin gives .fit, Strava gives .gpx ("Export GPX" on a run), and COROS, Suunto, Polar, Wahoo and others give .fit
or .tcx. So a runner on any device can get their runs in, with or without Strava.

## How a runner gets the file

- **One run:** on the Garmin Connect **website**, open the run, click the cog at the top right and choose **Export
  Original**. That downloads a `.zip` with one `.fit` inside. Taperday takes either, and several at once.
- **A whole history:** in the Garmin account, **Data Management** then **Export Your Data**. Garmin emails a link to a
  zip (it can take a while). The runner uploads that zip as it is.

## What happens to it

1. `POST /api/v1/me/activities` (multipart, field `file`), signed-in and signed-up runners only.
2. `ActivityFileReader` (Infrastructure) looks at what's in the file, not its name, and picks a reader:
   - **`.fit`** (Garmin, and the .zip around it): `FitActivityFileReader` checks the CRC and reads time, distance,
     altitude and heart rate from the records, plus the watch's own totals.
   - **`.gpx` and `.tcx`** (Strava, Apple Health apps, COROS, Suunto, Polar, Wahoo): `XmlActivityFileReader`. GPX has
     no distance of its own, so distance is worked out from the track's positions as they're read; TCX carries its own
     distance. XML is read with DTDs prohibited and no external resolver, so a malicious file can't read the server's
     files or blow up memory (XXE and entity-expansion attacks).
   In every case **GPS positions are never kept**: they live only long enough to measure the next step, then they're gone.
3. `Activity.Record` (Domain, plain C#) works out moving time, km splits, first vs second half and best efforts, and
   picks the plan session for that day.
4. Only that summary is saved. The file itself is never stored.

### Many files at once (`POST /api/v1/me/activities/batch`)

A Garmin account export can be gigabytes, far beyond an upload limit, and keeps its activities in a zip inside the
zip. So the **browser** opens it (`client/src/lib/fit-files.ts`, using `fflate` streaming, never the FIT SDK) and sends
only the `.fit` entries, in batches of up to 20 files and 20 MB (`lib/bulk-upload.ts`). The batch endpoint gives every
file its own result (imported, already uploaded, skipped as not a run, unreadable, or over the run limit) and one bad
file never fails the batch. Duplicates use the same rule as single uploads (same runner, same start time), so uploading
the same export twice is safe. Each batch gets a fresh sign-in token; the runner can stop at any time and pick the
same files again later. Once the 1,000-run limit is reached the rest are reported and not read. Files aren't sorted by
date first (that would mean reading the FIT format in the browser, which the SDK licence keeps server-side), so the
runs kept are the first 1,000 in the export, not necessarily the newest.

## The numbers

| | Rule | Where |
|---|---|---|
| Moving time | Time between samples counts if the runner covered ≥ 0.5 m/s (a slow walk) | `Track` |
| Splits | Every km by moving time, the last one shorter; tails under 10 m are dropped | `Splits` |
| Quickest / hardest | Fastest and slowest *full* km; none when there are fewer than two | `Splits.Quickest/Hardest` |
| Halves | Moving time either side of half the distance; within ±3 s/km is "even" | `Halves` |
| Best efforts | Fastest wall-clock stretch of 400 m, ½ mile, 1K, 1 mile, 2 mile, 5K, 10K, 15K, 10 mile, 20K, half, 30K and marathon anywhere in the run. Stops count, like a race clock | `BestEfforts`, `Track.FastestElapsedOver` |
| PB, near PB | Measured against the runner's *other* runs: a PB matches or beats an earlier best; within 3% is a near PB; a first-ever distance is neither. Only PBs, near PBs and race efforts are shown up front | `BestEfforts.Standing`, `IsWorthShowing` |
| Elevation gain | The watch's total ascent if it has one, else climbs of ≥ 3 m from the last low point | `Track.ElevationGainMetres` |
| Plan match | Sessions from the runner's active plans on the run's date *in the runner's time zone*; strength never matches; closest distance wins. Frozen at import | `PlannedSessionMatch.Pick` |
| Pace verdict | Judged on the part that matters: the whole run for steady sessions, the fastest stretch of the work block's length for tempo-style sessions, the fastest rep for repeats, nothing for hills and fartlek. Inside the zone range is on target, otherwise faster/slower by the gap to the nearest edge | `PlanComparison`, `Activity.ComparedWithPlan` |

## Judging a run against what it was for

The edge over a plain activity page is that Taperday knows what each run was for. Every planned session now carries a
`SessionStructure` (Domain/Plans): `Steady` (easy, long, race), `Continuous` (tempo, progression, fast finish, race-pace
block: warm-up and cool-down at easy pace around one work block), `Reps` (intervals, cruise intervals, race-pace reps)
or `ByEffort` (hills, fartlek). The import freezes it with the zone paces, the goal pace and the next session.

`RunReview` (Domain/Activities) turns that into facts, and the client words them (`activity-copy.ts`):

| Fact | Rule |
|---|---|
| Split scores | Each km against the zone it was meant for (work km against the work zone, warm-up/cool-down against easy), 2 s/km grace. Not scored for repeats, hills, fartlek or unplanned runs |
| Fast start | The first km of the effort at least 5 s/km quicker than its zone |
| Fade | The first km at least 8 s/km slower than the opening half of the effort, staying that slow on average to the end, with no later km back within 3 s/km. One hilly km isn't a fade |
| Quickest / hardest | Ranked within the effort only, never a warm-up, cool-down or the jogs between reps |
| Distance | As planned within 10% or 500 m |
| Goal pace | Long runs and races: average pace against the plan's goal pace |
| Heart-rate drift | Steady runs over 20 min: how much pace per heartbeat dropped from first half to second; over 5% is mentioned, neutrally |
| HR zones | Five zones as shares of the max heart rate the runner sets in Account (optional, 120–230). No max set, no zones: Taperday doesn't guess. Runs store moving seconds per bpm, so zones follow a changed max |

The plan view also shows uploaded runs: a done mark (linking to the run) on days with a planned run, a quiet
"Unplanned run" line otherwise, and planned vs run km per week on the Progress tab.

## Limits (agreed 19 Oct 2026)

- **Stored:** the summary only (totals, splits, best efforts, the matched session). No raw file, no GPS.
- **Kept:** until the runner deletes the run or their account. Account export includes runs; account deletion
  cascades to them.
- **Per runner:** 1,000 runs (`Activity.MaxPerRunner`), about 5–10 MB of rows at most.
- **Upload size:** 10 MB (`ActivityUpload.MaxFileBytes`); a zipped `.fit` may unpack to at most 40 MB, and at most
  250,000 samples are read.
- **Rate:** 60 single uploads an hour per runner (`uploads` policy), and 60 batches of up to 20 files an hour
  (`bulk-uploads` policy): 1,200 files an hour, more than the 1,000 a runner can keep.
- **Duplicates:** the same start time from the same runner is the same run (unique index): 409 `activity_exists`.

## The FIT SDK licence

`Garmin.FIT.Sdk` is under Garmin's FIT Protocol License, not an open-source licence. Nothing in it stops a free
public app, provided:

- It stays **server-side**. The licence forbids making the SDK "or any features or functionality" of it available to
  third parties, so never bundle `@garmin/fitsdk` into the client and never add a general "decode my file" endpoint.
  The API returns only Taperday's own derived numbers.
- It's referenced as a package, never vendored (DLL or source) into the repo, and never put under a copyleft licence.
- No safety-critical use: heart rate and pace are training information, with no medical claims.
- Garmin can end the licence on 30 days' notice or require upgrades. The reader sits behind
  `IActivityFileReader`, so it can be swapped for a decoder written from the public FIT protocol docs.

The grant is worded for "internal business purposes, including to use the FIT protocol in any software created by
Licensee". A public app relies on the second half of that sentence. Worth a second opinion before any paid tier.

## Strava's terms (checked 19 Oct 2026)

Pulling runs from Strava was first turned down for these terms, then built anyway in a shape that fits them: synced
runs are a 7-day rolling cache, never merged with uploads (`strava-sync.md`). The .fit route stays for everyone else.
Strava's API Agreement and API Policy (both effective 1 June 2026) and its developer docs say:

- **Not free to run:** a Standard-tier API app needs the developer to hold a paid Strava subscription (US $11.99 a
  month or $79.99 a year; there's no separate API fee). Athletes who connect don't appear to need one.
- **10 runners until reviewed:** new apps allow 1 athlete; the developer can raise that to 10; beyond 10 needs Strava's
  review, which "is not a guarantee". Reviewed Standard apps go up to 9,999.
- **No keeping runs:** Policy §6.2, "You may not retain Strava Data in your cache for longer than seven (7) days";
  §6.4 limits retention to the original purpose; §5.7 bars storing location data. So a Strava run is a copy fetched
  again before its 7 days are up and dropped on disconnect, never a permanent Taperday activity.
- **No merging:** §5.4, "You may not combine Strava Data with other customer data". So an upload and a Strava copy of
  the same run are never merged: the upload replaces the copy.
- **Also:** a runner's Strava data may be shown only to that runner (§2.3); no AI use of any kind, retrieval included
  (§5.3); no intermediaries or MCP servers (§5.16); deletions reflected within 48 hours (§6.3) and everything deleted
  within 30 days of a disconnect (§7.4); Garmin-sourced data needs Garmin attribution (§4.4).
- **Rate limits:** 200 requests per 15 minutes and 2,000 a day overall (100 and 1,000 for non-upload calls); 400 and
  4,000 after raising the app to 10 athletes.
- **Branding:** the official "Connect with Strava" button, unmodified "Powered by Strava" or
  "Compatible with Strava" logos less prominent than Taperday's, links to Strava data reading exactly "View on Strava",
  and never "Strava" in the app's name.

Sources: https://www.strava.com/legal/api, https://www.strava.com/legal/api_policy,
https://developers.strava.com/docs/rate-limits/, https://developers.strava.com/guidelines/,
https://communityhub.strava.com/developers-knowledge-base-14/strava-api-faq-12906. Re-check them before revisiting.

## Not done yet

- Heart rate is health data (POPIA "special personal information"). The privacy notice should say runs and heart rate
  are stored once this ships, and bumping `PrivacyNotice.CurrentVersion` would ask existing runners to accept again.
- Re-matching old runs when a plan is saved later.
- Laps: Garmin records them (auto-lap or workout steps), and they would judge repeats rep by rep instead of by the fastest stretch.
- Reading laps from TCX/FIT, to judge repeats rep by rep.
