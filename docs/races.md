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
