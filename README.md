# Start Line

A free, no-sign-up training plan builder for runners, from a first 5K to Comrades.

Pick a race, a goal time and the days you can run. Start Line builds a week-by-week plan with a
pace and a purpose for every session, and you can share it as a link.

## What it does

- **Any race.** Choose from the race catalogue or enter any distance and date.
- **Your days.** Tick the 3 to 7 days you can run and pick your long-run day. Hard sessions are
  spread so they never land back to back when your days allow it.
- **Trains for the distance.** 5K plans lean on speed, half and full marathons on threshold and race
  pace, and ultras on back-to-back weekends, long hills and time on feet. Two Oceans and Comrades
  get different profiles.
- **The full set of sessions.** Easy, recovery, strides, hills, fartlek, intervals, tempo, cruise
  intervals, progression runs, race-pace runs, steady, fast-finish and rehearsal long runs, a
  race-week sharpener and a shakeout. Strength and mobility days are optional.
- **Paces from your goal.** Each zone is anchored to an equivalent race performance instead of a
  fixed offset, so easy really is easy for every distance.
- **Built-in safety rails.** Volume rises by at most 10% a week, every fourth week eases off, long
  runs are capped by time as well as distance, and the plan warns you when the timeline or your
  current mileage makes the goal a stretch.
- **Race-time predictor.** Not sure of a goal? Estimate it from a recent result.

## Running it locally

Needs the .NET 10 SDK and Node 22+.

```bash
dotnet run --project src/StartLine.API --launch-profile http   # API on http://localhost:5122
cd client && npm install && npm run dev                         # app on http://localhost:5173
```

No secrets or database are needed. API docs are at http://localhost:5122/scalar in development.

## Tests

```bash
dotnet test StartLine.slnx
cd client && npm test
```

## Race calendar

The race calendar builds itself. Each race source (organiser feeds, federation calendars, a curated list) is
fetched at startup and on a schedule. Sources are reconciled automatically: the most authoritative one wins,
and every race says whether its date and distance are confirmed. If a source goes down, its last good data is
kept. Plans for unconfirmed races say so, and because plans live in the link, they move if the date moves.

The curated list in `src/StartLine.API/appsettings.json` is the fallback source. Adding an online source means
writing one small `IRaceSource` class; check that site's terms of use first.
