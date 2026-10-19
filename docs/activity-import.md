# Activity import (Garmin .fit)

Runners upload a run from their watch and see it against their plan. It's free all the way: Garmin's own developer
API is business-only (and closed to new applications), and Strava's now needs a paid subscription, so the route is
the file Garmin Connect already gives every user. Runners on Strava can instead connect it once and have runs
arrive by themselves: see `strava-sync.md`. Both go through the same analysis below.

## How a runner gets the file

On the Garmin Connect **website**, open the run, click the cog at the top right and choose **Export Original**.
That downloads a `.zip` with one `.fit` inside. Taperday takes either the zip or the bare `.fit`.

## What happens to it

1. `POST /api/v1/me/activities` (multipart, field `file`), signed-in and signed-up runners only.
2. `FitActivityFileReader` (Infrastructure) unzips if needed, checks it's a FIT file with a valid CRC, and reads only
   time, distance, altitude and heart rate from the records, plus the watch's own totals (ascent, calories, average
   and max heart rate) from the session. **GPS positions are never read.**
3. `Activity.Record` (Domain, plain C#) works out moving time, km splits, first vs second half and best efforts, and
   picks the plan session for that day.
4. Only that summary is saved. The file itself is never stored.

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
- **Rate:** 60 uploads an hour per runner (`uploads` policy).
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

## Not done yet

- Heart rate is health data (POPIA "special personal information"). The privacy notice should say runs and heart rate
  are stored once this ships, and bumping `PrivacyNotice.CurrentVersion` would ask existing runners to accept again.
- Re-matching old runs when a plan is saved later.
- Laps: Garmin records them (auto-lap or workout steps), and they would judge repeats rep by rep instead of by the fastest stretch.
- Other files: `.gpx` and `.tcx` (Strava and Apple exports) would need their own readers behind the same interface.
