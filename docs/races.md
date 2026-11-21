# Races: headline and searchable

The race step shows the **headline races** as bibs on the rack. Runners can **search** every other race by name or
town. Anything else is still covered by "Another race".

## Where races live

| Kind | Where | Shown |
|---|---|---|
| Headline | `RaceCatalogue:Races` in `src/StartLine.API/appsettings.json`, with `"Major": true` | On the rack, and in search |
| Searchable | The `CatalogueRaces` table in the database | In search only (or on the rack if `Major` = 1) |

- **How they reach the app:** both are sources for the race calendar (`IRaceSource`). The calendar re-syncs every six hours (`RaceCalendar:SyncInterval`) and on every start, so a new row appears within six hours.
- **When a race is in both:** the configuration entry wins (priority 10 against 5).

## Adding a searchable race

Insert a row into `CatalogueRaces` on the right database: staging first, then production.

```sql
INSERT INTO CatalogueRaces (Slug, Name, Date, DistanceKm, Location, Summary, Website, DateConfirmed, DateSource, DistanceConfirmed, Major)
VALUES ('soweto-marathon-2026', 'Soweto Marathon', '2026-11-29', 42.195, 'Soweto',
        'A marathon through the streets of Soweto, finishing at FNB Stadium.', 'https://www.sowetomarathon.com/',
        1, 'https://www.sowetomarathon.com/', 1, 0);
```

To ship races with a deploy instead, add them in a new EF migration with `InsertData`, as
`AddCatalogueRaces` does for the first set.

## Rules for dates

- **Confirmed or not:** set `DateConfirmed` = 1 **only** when the organiser has announced the date, on their own site, in a press release or on the official entry page. Calendar and aggregator sites aren't confirmation. Leave the flag at 0, and the app says "date to be confirmed".
- **Source:** always record `DateSource`, the URL where the date was seen.
- **Slug:** the race name plus the year (`knysna-forest-marathon-2027`). Saved plans refer to a race by its slug, so never change or reuse one. Add a new row for each year's edition.
- **Past races:** past dates drop out of the list and search by themselves. Old rows can stay.

## Promoting a race to the rack

Either add it to `appsettings.json` with `"Major": true`, or set `Major` = 1 on its database row. Keep the rack short.

## South African short-distance expansion (21 November 2026)

The data-only migration `20261121180000_AddSouthAfricanShortDistanceRaces` adds **58 searchable distance choices** from **26 South African race events/editions**. Breakdown: **20 × 5 km**, **22 × 10 km**, **12 × half marathon (21.0975 km)**, **2 × marathon**, **1 × 15 km** and **1 × 27 km**.

- **Separate row per distance:** for example, `hoka-half-runfest-5km-2027`, `hoka-half-runfest-10km-2027` and `hoka-half-runfest-half-marathon-2027` have their own stable slugs and distances. Each should create a correctly sized training plan. Do not collapse them into one event row or use 21.1 instead of 21.0975 as the plan's race distance.
- **Search only:** every new row has `Major = false`. The headline rack stays uncluttered. Users find races by name or town through the normal race search and can still choose **Another race**.
- **Where:** Western Cape, Eastern Cape, Gauteng, KwaZulu-Natal, Mpumalanga, Limpopo and North West. This is a curated first batch, not an exhaustive national calendar.
- **Evidence:** sources and their URLs are stored on every row (`DateSource`). The sample includes organiser/registration pages (Top Events, Milkwood Run, Cape Town Marathon, Entry Ninja), the Eastern Province Athletics federation calendar, and a few race-calendar entries.
- **Provisional dates:** **13** rows rely on secondary calendars rather than an organiser's own published entry/announcement and use `DateConfirmed=false`. Never imply those dates or registrations are guaranteed. Even confirmed events can move; verify before travel or signup.
- **Migration safety:** `IF NOT EXISTS` guards each race slug, so previously entered catalogue rows with the same slug are left unchanged. `Down` removes only this migration's listed slugs. Database schema/EF snapshot is unchanged.
- **Release:** updating the GitHub branch alone does **not** update staging or production database rows. When merged and deployed, the EF migration inserts the new records into that environment's `CatalogueRaces` table; the calendar refreshes on startup or its normal six-hour sync. Production remains subject to the release workflow.
- **QA:** `SouthAfricanRaceCatalogueTests` checks migration coverage and independent 5 km / 10 km / half-marathon search and plan creation. Also search a seeded race on deployed staging after migration, including one provisional date and a race with several distances; check dates, slugs, distances, headline rack, plan-builder target distance, and links. Note that integration-test DB reset may clear seed data and therefore standalone integration tests explicitly insert synthetic rows.

### Catalogue maintenance

Race editions are annual. A 2026 slug is never reused for 2027. The event date may be sourced from an organiser/official entry page and marked confirmed only with that evidence; secondary calendars remain provisional. Use an additive data-only migration or a controlled one-time database insert, not a permanent web scraper or fake event date. Before adding another batch, deduplicate by `slug`, check dates and distances and keep the popular-races rack deliberately short.
