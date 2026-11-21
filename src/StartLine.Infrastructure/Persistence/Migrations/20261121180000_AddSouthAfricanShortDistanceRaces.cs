using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Infrastructure.Persistence.Migrations;

/// <summary>
/// Adds independently searchable distance choices for South African road races.
/// One row per event edition AND distance is intentional: the plan builder must receive the right goal distance.
/// Dates checked against official event/entry pages and published calendars on 21 November 2026.
/// Unconfirmed dates remain provisional. Do not promote these to the headline race rack.
/// This data-only migration has no model changes; the existing EF snapshot remains valid.
/// </summary>
[DbContext(typeof(StartLineDbContext))]
[Migration("20261121180000_AddSouthAfricanShortDistanceRaces")]
public sealed class AddSouthAfricanShortDistanceRaces : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'aspen-road-race-5km-2026')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'aspen-road-race-5km-2026', N'Aspen Road Race 5 km', '2026-11-28', 5, N'Gqeberha, Eastern Cape', N'Community road race in Gqeberha.', N'https://epathletics.co.za/events/category/road-running/', 1, N'https://epathletics.co.za/events/category/road-running/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'aspen-road-race-10km-2026')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'aspen-road-race-10km-2026', N'Aspen Road Race 10 km', '2026-11-28', 10, N'Gqeberha, Eastern Cape', N'Community road race in Gqeberha.', N'https://epathletics.co.za/events/category/road-running/', 1, N'https://epathletics.co.za/events/category/road-running/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'nmb-1city-5km-2026')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'nmb-1city-5km-2026', N'NMB 1City 5 km', '2026-12-06', 5, N'Gqeberha, Eastern Cape', N'Baywest Mall road-race event; the marathon is already separately listed.', N'https://epathletics.co.za/events/category/road-running/', 1, N'https://epathletics.co.za/events/category/road-running/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'nmb-1city-10km-2026')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'nmb-1city-10km-2026', N'NMB 1City 10 km', '2026-12-06', 10, N'Gqeberha, Eastern Cape', N'Baywest Mall road-race event; the marathon is already separately listed.', N'https://epathletics.co.za/events/category/road-running/', 1, N'https://epathletics.co.za/events/category/road-running/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'nmb-1city-half-marathon-2026')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'nmb-1city-half-marathon-2026', N'NMB 1City Half Marathon', '2026-12-06', 21.0975, N'Gqeberha, Eastern Cape', N'Baywest Mall road-race event; the marathon is already separately listed.', N'https://epathletics.co.za/events/category/road-running/', 1, N'https://epathletics.co.za/events/category/road-running/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'growthpoint-sundowner-5km-2026')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'growthpoint-sundowner-5km-2026', N'Growthpoint Sundowner 5 km', '2026-12-08', 5, N'Green Point, Cape Town, Western Cape', N'Evening run and walk in Green Point.', N'https://topevents.co.za/event/growthpoint-properties-sundowner-10km-run-walk-and-5km-fun-run-2026/', 1, N'https://topevents.co.za/event/growthpoint-properties-sundowner-10km-run-walk-and-5km-fun-run-2026/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'growthpoint-sundowner-10km-2026')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'growthpoint-sundowner-10km-2026', N'Growthpoint Sundowner 10 km', '2026-12-08', 10, N'Green Point, Cape Town, Western Cape', N'Evening run and walk in Green Point.', N'https://topevents.co.za/event/growthpoint-properties-sundowner-10km-run-walk-and-5km-fun-run-2026/', 1, N'https://topevents.co.za/event/growthpoint-properties-sundowner-10km-run-walk-and-5km-fun-run-2026/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'taalmonument-night-race-5km-2026')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'taalmonument-night-race-5km-2026', N'Taalmonument Night Race 5 km', '2026-12-09', 5, N'Paarl, Western Cape', N'Evening run/walk around Paarl.', N'https://topevents.co.za/', 1, N'https://topevents.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'taalmonument-night-race-10km-2026')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'taalmonument-night-race-10km-2026', N'Taalmonument Night Race 10 km', '2026-12-09', 10, N'Paarl, Western Cape', N'Evening run/walk around Paarl.', N'https://topevents.co.za/', 1, N'https://topevents.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'sandton-half-event-10km-2026')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'sandton-half-event-10km-2026', N'Sandton Half Marathon 10 km', '2026-12-13', 10, N'Sandton, Johannesburg, Gauteng', N'Shorter road-race option at the Sandton Half Marathon.', NULL, 0, N'https://app.raceface.co.za/events?distance=10k', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'first-choice-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'first-choice-5km-2027', N'First Choice 5 km', '2027-01-09', 5, N'Jeffreys Bay, Eastern Cape', N'Road and fun-run distances based at Victory Christian School.', N'https://epathletics.co.za/event/2027-01-09-first-choice-15km-5km-fun-run-60m-dash/', 1, N'https://epathletics.co.za/event/2027-01-09-first-choice-15km-5km-fun-run-60m-dash/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'first-choice-15km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'first-choice-15km-2027', N'First Choice 15 km', '2027-01-09', 15, N'Jeffreys Bay, Eastern Cape', N'Road and fun-run distances based at Victory Christian School.', N'https://epathletics.co.za/event/2027-01-09-first-choice-15km-5km-fun-run-60m-dash/', 1, N'https://epathletics.co.za/event/2027-01-09-first-choice-15km-5km-fun-run-60m-dash/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'colchester-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'colchester-5km-2027', N'Colchester Road Race 5 km', '2027-01-23', 5, N'Colchester, Eastern Cape', N'Road races around Colchester near the Sundays River.', N'https://epathletics.co.za/event/2027-01-23-colchester-10km-5km-1-mile/', 1, N'https://epathletics.co.za/event/2027-01-23-colchester-10km-5km-1-mile/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'colchester-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'colchester-10km-2027', N'Colchester Road Race 10 km', '2027-01-23', 10, N'Colchester, Eastern Cape', N'Road races around Colchester near the Sundays River.', N'https://epathletics.co.za/event/2027-01-23-colchester-10km-5km-1-mile/', 1, N'https://epathletics.co.za/event/2027-01-23-colchester-10km-5km-1-mile/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'johnson-crane-hire-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'johnson-crane-hire-5km-2027', N'Johnson Crane Hire Marathon 5 km', '2027-01-24', 5, N'Benoni, Gauteng', N'Shorter races from the Willowmoore Park stadium event.', NULL, 0, N'https://app.raceface.co.za/events?distance=10k', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'johnson-crane-hire-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'johnson-crane-hire-10km-2027', N'Johnson Crane Hire Marathon 10 km', '2027-01-24', 10, N'Benoni, Gauteng', N'Shorter races from the Willowmoore Park stadium event.', NULL, 0, N'https://app.raceface.co.za/events?distance=10k', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'johnson-crane-hire-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'johnson-crane-hire-half-marathon-2027', N'Johnson Crane Hire Marathon Half Marathon', '2027-01-24', 21.0975, N'Benoni, Gauteng', N'Shorter races from the Willowmoore Park stadium event.', NULL, 0, N'https://app.raceface.co.za/events?distance=10k', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'lighthouse-night-race-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'lighthouse-night-race-5km-2027', N'Lighthouse Night Race 5 km', '2027-02-03', 5, N'Sea Point, Cape Town, Western Cape', N'Evening run along Sea Point Promenade.', N'https://topevents.co.za/event/the-crazy-store-lighthouse-night-race-10km-run-walk-and-5km-fun-run-2027-2/', 1, N'https://topevents.co.za/event/the-crazy-store-lighthouse-night-race-10km-run-walk-and-5km-fun-run-2027-2/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'lighthouse-night-race-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'lighthouse-night-race-10km-2027', N'Lighthouse Night Race 10 km', '2027-02-03', 10, N'Sea Point, Cape Town, Western Cape', N'Evening run along Sea Point Promenade.', N'https://topevents.co.za/event/the-crazy-store-lighthouse-night-race-10km-run-walk-and-5km-fun-run-2027-2/', 1, N'https://topevents.co.za/event/the-crazy-store-lighthouse-night-race-10km-run-walk-and-5km-fun-run-2027-2/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'thru-the-karoo-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'thru-the-karoo-10km-2027', N'Thru The Karoo 10 km', '2027-02-06', 10, N'Graaff-Reinet, Eastern Cape', N'Road distances in and around Graaff-Reinet; the separate 15 km option is a trail run.', N'https://thruthekaroo.co.za/', 1, N'https://epathletics.co.za/event/2027-02-06-thru-the-karoo-42-2km-21-1km-15-km-trail-run-10km/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'thru-the-karoo-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'thru-the-karoo-half-marathon-2027', N'Thru The Karoo Half Marathon', '2027-02-06', 21.0975, N'Graaff-Reinet, Eastern Cape', N'Road distances in and around Graaff-Reinet; the separate 15 km option is a trail run.', N'https://thruthekaroo.co.za/', 1, N'https://epathletics.co.za/event/2027-02-06-thru-the-karoo-42-2km-21-1km-15-km-trail-run-10km/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'thru-the-karoo-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'thru-the-karoo-marathon-2027', N'Thru The Karoo Marathon', '2027-02-06', 42.195, N'Graaff-Reinet, Eastern Cape', N'Road distances in and around Graaff-Reinet; the separate 15 km option is a trail run.', N'https://thruthekaroo.co.za/', 1, N'https://epathletics.co.za/event/2027-02-06-thru-the-karoo-42-2km-21-1km-15-km-trail-run-10km/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'27-for-freedom-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'27-for-freedom-5km-2027', N'27 for Freedom 5 km', '2027-02-06', 5, N'Drakenstein, Paarl, Western Cape', N'Run and walk near the Drakenstein Correctional Centre in the Winelands.', N'https://topevents.co.za/', 1, N'https://topevents.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'27-for-freedom-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'27-for-freedom-10km-2027', N'27 for Freedom 10 km', '2027-02-06', 10, N'Drakenstein, Paarl, Western Cape', N'Run and walk near the Drakenstein Correctional Centre in the Winelands.', N'https://topevents.co.za/', 1, N'https://topevents.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'27-for-freedom-27km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'27-for-freedom-27km-2027', N'27 for Freedom 27 km', '2027-02-06', 27, N'Drakenstein, Paarl, Western Cape', N'Run and walk near the Drakenstein Correctional Centre in the Winelands.', N'https://topevents.co.za/', 1, N'https://topevents.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'hoka-half-runfest-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'hoka-half-runfest-5km-2027', N'HOKA Half Runfest Cape Town 5 km', '2027-02-13', 5, N'Green Point, Cape Town, Western Cape', N'Road-running festival in Green Point with three distances.', N'https://www.entryninja.com/events/84275-hoka-half-cape-town', 1, N'https://www.entryninja.com/events/84275-hoka-half-cape-town', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'hoka-half-runfest-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'hoka-half-runfest-10km-2027', N'HOKA Half Runfest Cape Town 10 km', '2027-02-13', 10, N'Green Point, Cape Town, Western Cape', N'Road-running festival in Green Point with three distances.', N'https://www.entryninja.com/events/84275-hoka-half-cape-town', 1, N'https://www.entryninja.com/events/84275-hoka-half-cape-town', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'hoka-half-runfest-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'hoka-half-runfest-half-marathon-2027', N'HOKA Half Runfest Cape Town Half Marathon', '2027-02-13', 21.0975, N'Green Point, Cape Town, Western Cape', N'Road-running festival in Green Point with three distances.', N'https://www.entryninja.com/events/84275-hoka-half-cape-town', 1, N'https://www.entryninja.com/events/84275-hoka-half-cape-town', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'knysna-heads-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'knysna-heads-5km-2027', N'Knysna Heads Marathon 5 km', '2027-02-13', 5, N'Knysna, Western Cape', N'Knysna road-running festival; each distance has a separate entry.', N'https://www.entryninja.com/events/82847-knysna-heads-marathon', 1, N'https://www.entryninja.com/events/82847-knysna-heads-marathon', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'knysna-heads-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'knysna-heads-10km-2027', N'Knysna Heads Marathon 10 km', '2027-02-13', 10, N'Knysna, Western Cape', N'Knysna road-running festival; each distance has a separate entry.', N'https://www.entryninja.com/events/82847-knysna-heads-marathon', 1, N'https://www.entryninja.com/events/82847-knysna-heads-marathon', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'knysna-heads-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'knysna-heads-half-marathon-2027', N'Knysna Heads Marathon Half Marathon', '2027-02-13', 21.0975, N'Knysna, Western Cape', N'Knysna road-running festival; each distance has a separate entry.', N'https://www.entryninja.com/events/82847-knysna-heads-marathon', 1, N'https://www.entryninja.com/events/82847-knysna-heads-marathon', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'knysna-heads-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'knysna-heads-marathon-2027', N'Knysna Heads Marathon Marathon', '2027-02-13', 42.195, N'Knysna, Western Cape', N'Knysna road-running festival; each distance has a separate entry.', N'https://www.entryninja.com/events/82847-knysna-heads-marathon', 1, N'https://www.entryninja.com/events/82847-knysna-heads-marathon', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'sasol-secunda-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'sasol-secunda-5km-2027', N'Sasol Secunda 5 km', '2027-02-13', 5, N'Secunda, Mpumalanga', N'Secunda community road race with a half marathon and shorter distances.', N'https://www.entryninja.com/events/84770-sasol-secunda', 1, N'https://www.entryninja.com/events/84770-sasol-secunda', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'sasol-secunda-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'sasol-secunda-10km-2027', N'Sasol Secunda 10 km', '2027-02-13', 10, N'Secunda, Mpumalanga', N'Secunda community road race with a half marathon and shorter distances.', N'https://www.entryninja.com/events/84770-sasol-secunda', 1, N'https://www.entryninja.com/events/84770-sasol-secunda', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'sasol-secunda-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'sasol-secunda-half-marathon-2027', N'Sasol Secunda Half Marathon', '2027-02-13', 21.0975, N'Secunda, Mpumalanga', N'Secunda community road race with a half marathon and shorter distances.', N'https://www.entryninja.com/events/84770-sasol-secunda', 1, N'https://www.entryninja.com/events/84770-sasol-secunda', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'milkwood-run-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'milkwood-run-5km-2027', N'Milkwood Run 5 km', '2027-02-14', 5, N'Kommetjie, Cape Town, Western Cape', N'Coastal route near Kommetjie and Scarborough.', N'https://www.milkwoodrun.co.za/', 1, N'https://www.milkwoodrun.co.za/raceinfo.php', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'milkwood-run-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'milkwood-run-10km-2027', N'Milkwood Run 10 km', '2027-02-14', 10, N'Kommetjie, Cape Town, Western Cape', N'Coastal route near Kommetjie and Scarborough.', N'https://www.milkwoodrun.co.za/', 1, N'https://www.milkwoodrun.co.za/raceinfo.php', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'milkwood-run-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'milkwood-run-half-marathon-2027', N'Milkwood Run Half Marathon', '2027-02-14', 21.0975, N'Kommetjie, Cape Town, Western Cape', N'Coastal route near Kommetjie and Scarborough.', N'https://www.milkwoodrun.co.za/', 1, N'https://www.milkwoodrun.co.za/raceinfo.php', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'nmb-half-championship-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'nmb-half-championship-5km-2027', N'NMB Half Marathon 5 km', '2027-02-20', 5, N'Summerstrand, Gqeberha, Eastern Cape', N'5 km companion run to the Nelson Mandela Bay half-marathon championships.', N'https://epathletics.co.za/event/2027-02-20-nmb-half-marathon-incorporating-sa-championship-21-1km-5km-and-1-mile/', 1, N'https://epathletics.co.za/event/2027-02-20-nmb-half-marathon-incorporating-sa-championship-21-1km-5km-and-1-mile/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'peninsula-marathon-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'peninsula-marathon-half-marathon-2027', N'Balwin Sport Peninsula Marathon Half Marathon', '2027-02-21', 21.0975, N'Simon''s Town, Cape Town, Western Cape', N'Half-marathon distance alongside the Peninsula Marathon.', N'https://celticharriers.co.za/', 0, N'https://www.sportmentor.co.za/guides/western-cape-road-running-races', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'v-slots-family-run-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'v-slots-family-run-5km-2027', N'V-Slots Family Run 5 km', '2027-02-27', 5, N'Gqeberha, Eastern Cape', N'Family road race from the Cillie Sports Grounds.', N'https://epathletics.co.za/event/2027-02-27-v-slots-family-run-10km-5km/', 1, N'https://epathletics.co.za/event/2027-02-27-v-slots-family-run-10km-5km/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'v-slots-family-run-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'v-slots-family-run-10km-2027', N'V-Slots Family Run 10 km', '2027-02-27', 10, N'Gqeberha, Eastern Cape', N'Family road race from the Cillie Sports Grounds.', N'https://epathletics.co.za/event/2027-02-27-v-slots-family-run-10km-5km/', 1, N'https://epathletics.co.za/event/2027-02-27-v-slots-family-run-10km-5km/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'capital-city-marathon-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'capital-city-marathon-5km-2027', N'Capital City Marathon 5 km', '2027-02-28', 5, N'Pietermaritzburg, KwaZulu-Natal', N'Road races in Pietermaritzburg; the marathon is already separately listed.', N'https://enter.entryninja.com/events/84516-capital-city-marathon', 1, N'https://enter.entryninja.com/events/84516-capital-city-marathon', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'capital-city-marathon-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'capital-city-marathon-10km-2027', N'Capital City Marathon 10 km', '2027-02-28', 10, N'Pietermaritzburg, KwaZulu-Natal', N'Road races in Pietermaritzburg; the marathon is already separately listed.', N'https://enter.entryninja.com/events/84516-capital-city-marathon', 1, N'https://enter.entryninja.com/events/84516-capital-city-marathon', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'capital-city-marathon-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'capital-city-marathon-half-marathon-2027', N'Capital City Marathon Half Marathon', '2027-02-28', 21.0975, N'Pietermaritzburg, KwaZulu-Natal', N'Road races in Pietermaritzburg; the marathon is already separately listed.', N'https://enter.entryninja.com/events/84516-capital-city-marathon', 1, N'https://enter.entryninja.com/events/84516-capital-city-marathon', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'weskus-marathon-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'weskus-marathon-5km-2027', N'Weskus Marathon 5 km', '2027-03-06', 5, N'Langebaan, Western Cape', N'West Coast road-race distances around Langebaan.', NULL, 0, N'https://www.sportmentor.co.za/guides/western-cape-road-running-races', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'weskus-marathon-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'weskus-marathon-10km-2027', N'Weskus Marathon 10 km', '2027-03-06', 10, N'Langebaan, Western Cape', N'West Coast road-race distances around Langebaan.', NULL, 0, N'https://www.sportmentor.co.za/guides/western-cape-road-running-races', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'weskus-marathon-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'weskus-marathon-half-marathon-2027', N'Weskus Marathon Half Marathon', '2027-03-06', 21.0975, N'Langebaan, Western Cape', N'West Coast road-race distances around Langebaan.', NULL, 0, N'https://www.sportmentor.co.za/guides/western-cape-road-running-races', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'overberg-blue-crane-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'overberg-blue-crane-5km-2027', N'Overberg Blue Crane Half Marathon 5 km', '2027-03-13', 5, N'Helderstroom, Western Cape', N'Overberg community road-race event.', NULL, 0, N'https://www.sportmentor.co.za/guides/western-cape-road-running-races', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'overberg-blue-crane-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'overberg-blue-crane-10km-2027', N'Overberg Blue Crane Half Marathon 10 km', '2027-03-13', 10, N'Helderstroom, Western Cape', N'Overberg community road-race event.', NULL, 0, N'https://www.sportmentor.co.za/guides/western-cape-road-running-races', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'overberg-blue-crane-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'overberg-blue-crane-half-marathon-2027', N'Overberg Blue Crane Half Marathon Half Marathon', '2027-03-13', 21.0975, N'Helderstroom, Western Cape', N'Overberg community road-race event.', NULL, 0, N'https://www.sportmentor.co.za/guides/western-cape-road-running-races', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'know-who-you-are-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'know-who-you-are-5km-2027', N'Know Who You Are Road Race 5 km', '2027-03-20', 5, N'Mankweng, Limpopo', N'Festival road race at the University of Limpopo, Turfloop campus.', N'https://enter.entryninja.com/events/84565-kwya-festival-road-race', 1, N'https://enter.entryninja.com/events/84565-kwya-festival-road-race', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'know-who-you-are-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'know-who-you-are-10km-2027', N'Know Who You Are Road Race 10 km', '2027-03-20', 10, N'Mankweng, Limpopo', N'Festival road race at the University of Limpopo, Turfloop campus.', N'https://enter.entryninja.com/events/84565-kwya-festival-road-race', 1, N'https://enter.entryninja.com/events/84565-kwya-festival-road-race', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'know-who-you-are-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'know-who-you-are-half-marathon-2027', N'Know Who You Are Road Race Half Marathon', '2027-03-20', 21.0975, N'Mankweng, Limpopo', N'Festival road race at the University of Limpopo, Turfloop campus.', N'https://enter.entryninja.com/events/84565-kwya-festival-road-race', 1, N'https://enter.entryninja.com/events/84565-kwya-festival-road-race', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'loskop-marathon-series-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'loskop-marathon-series-10km-2027', N'Loskop Marathon Series 10 km', '2027-04-24', 10, N'Middelburg, Mpumalanga', N'10 km road-race option at the Loskop race weekend.', N'http://www.loskopmarathon.co.za', 0, N'https://app.raceface.co.za/events?distance=10k', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'n12-ultra-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'n12-ultra-10km-2027', N'N12 Ultra Marathon 10 km', '2027-05-01', 10, N'Klerksdorp, North West', N'10 km companion race to the N12 ultra in Klerksdorp.', NULL, 0, N'https://app.raceface.co.za/events?distance=10k', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'durban-international-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'durban-international-10km-2027', N'Durban International Marathon 10 km', '2027-05-02', 10, N'Durban, KwaZulu-Natal', N'10 km event alongside Durban International Marathon.', N'https://durbanmarathon.co.za/', 1, N'https://durbanmarathon.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'cape-town-peace-run-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'cape-town-peace-run-5km-2027', N'Sanlam Cape Town Peace Run 5 km', '2027-05-22', 5, N'Green Point, Cape Town, Western Cape', N'5 km Peace Run on the day before the Cape Town Marathon.', N'https://capetownmarathon.com/peace-runs/', 1, N'https://capetownmarathon.com/peace-runs/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'mielie-marathon-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'mielie-marathon-5km-2027', N'Mielie Marathon 5 km', '2027-01-16', 5, N'Welkom, Free State', N'Road-running festival from Welkom Rugby Club with a half marathon and shorter options.', N'https://enter.chiptimer.co.za/', 1, N'https://enter.chiptimer.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'mielie-marathon-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'mielie-marathon-10km-2027', N'Mielie Marathon 10 km', '2027-01-16', 10, N'Welkom, Free State', N'Road-running festival from Welkom Rugby Club with a half marathon and shorter options.', N'https://enter.chiptimer.co.za/', 1, N'https://enter.chiptimer.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'mielie-marathon-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'mielie-marathon-half-marathon-2027', N'Mielie Marathon Half Marathon', '2027-01-16', 21.0975, N'Welkom, Free State', N'Road-running festival from Welkom Rugby Club with a half marathon and shorter options.', N'https://enter.chiptimer.co.za/', 1, N'https://enter.chiptimer.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'pamoja-athletics-marathon-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'pamoja-athletics-marathon-10km-2027', N'Pamoja Athletics Club Marathon 10 km', '2027-01-23', 10, N'Bloemfontein, Free State', N'Road races at Tempe Military Base in Bloemfontein.', N'https://enter.chiptimer.co.za/', 1, N'https://enter.chiptimer.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'pamoja-athletics-marathon-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'pamoja-athletics-marathon-half-marathon-2027', N'Pamoja Athletics Club Marathon Half Marathon', '2027-01-23', 21.0975, N'Bloemfontein, Free State', N'Road races at Tempe Military Base in Bloemfontein.', N'https://enter.chiptimer.co.za/', 1, N'https://enter.chiptimer.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'meerkat-marathon-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'meerkat-marathon-10km-2027', N'Meerkat Marathon 10 km', '2027-02-06', 10, N'Kimberley, Northern Cape', N'Road races based at Hoerskool Diamantveld in Kimberley.', N'https://www.peaktiming.co.za/', 1, N'https://www.peaktiming.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'meerkat-marathon-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'meerkat-marathon-half-marathon-2027', N'Meerkat Marathon Half Marathon', '2027-02-06', 21.0975, N'Kimberley, Northern Cape', N'Road races based at Hoerskool Diamantveld in Kimberley.', N'https://www.peaktiming.co.za/', 1, N'https://www.peaktiming.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'randburg-harriers-valentines-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'randburg-harriers-valentines-5km-2027', N'Randburg Harriers Valentines Race 5 km', '2027-02-12', 5, N'Randburg, Gauteng', N'Valentine''s road races from Randburg Sports Complex.', N'https://www.peaktiming.co.za/', 1, N'https://www.peaktiming.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'randburg-harriers-valentines-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'randburg-harriers-valentines-10km-2027', N'Randburg Harriers Valentines Race 10 km', '2027-02-12', 10, N'Randburg, Gauteng', N'Valentine''s road races from Randburg Sports Complex.', N'https://www.peaktiming.co.za/', 1, N'https://www.peaktiming.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'bieliemielie-marathon-5km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'bieliemielie-marathon-5km-2027', N'Bieliemielie Marathon 5 km', '2027-02-27', 5, N'Reitz, Free State', N'Road races from Reitz Bowls Club in the Free State.', N'https://www.peaktiming.co.za/', 1, N'https://www.peaktiming.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'bieliemielie-marathon-10km-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'bieliemielie-marathon-10km-2027', N'Bieliemielie Marathon 10 km', '2027-02-27', 10, N'Reitz, Free State', N'Road races from Reitz Bowls Club in the Free State.', N'https://www.peaktiming.co.za/', 1, N'https://www.peaktiming.co.za/', 1, 0);
        END

        IF NOT EXISTS (SELECT 1 FROM [dbo].[CatalogueRaces] WHERE [Slug] = N'bieliemielie-marathon-half-marathon-2027')
        BEGIN
            INSERT INTO [dbo].[CatalogueRaces] ([Slug], [Name], [Date], [DistanceKm], [Location], [Summary], [Website], [DateConfirmed], [DateSource], [DistanceConfirmed], [Major])
            VALUES (N'bieliemielie-marathon-half-marathon-2027', N'Bieliemielie Marathon Half Marathon', '2027-02-27', 21.0975, N'Reitz, Free State', N'Road races from Reitz Bowls Club in the Free State.', N'https://www.peaktiming.co.za/', 1, N'https://www.peaktiming.co.za/', 1, 0);
        END
        """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Deliberately retain the catalogue rows on rollback. A row with one of these slugs
        // might have existed before Up() (which uses IF NOT EXISTS), and saved plans may
        // refer to it. Deleting those rows could destroy unrelated runner-facing data.
        // Re-applying the migration is safe because Up() is idempotent by slug.
    }
}
