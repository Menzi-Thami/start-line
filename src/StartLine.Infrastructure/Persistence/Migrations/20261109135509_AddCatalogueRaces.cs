using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCatalogueRaces : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CatalogueRaces",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Slug = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    DistanceKm = table.Column<double>(type: "float", nullable: false),
                    Location = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Website = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    DateConfirmed = table.Column<bool>(type: "bit", nullable: false),
                    DateSource = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DistanceConfirmed = table.Column<bool>(type: "bit", nullable: false),
                    Major = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CatalogueRaces", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CatalogueRaces_Slug",
                table: "CatalogueRaces",
                column: "Slug",
                unique: true);

            // The first searchable races (checked on 9 November 2026). DateConfirmed only where the organiser has
            // announced the date; DateSource records where each date was seen. Add more with SQL or a new migration.
            migrationBuilder.InsertData(
                table: "CatalogueRaces",
                columns: ["Slug", "Name", "Date", "DistanceKm", "Location", "Summary", "Website", "DateConfirmed", "DateSource", "DistanceConfirmed", "Major"],
                values: new object[,]
                {
                    { "rac-tough-one-2026", "RAC Tough One 32km", new DateOnly(2026, 11, 29), 32, "Randburg", "A 32 km road race starting and finishing at Randburg Sports Complex, organised by Rand Athletic Club.", "https://randathleticclub.com/", false, "https://runningcalendar.co.za/events/rac-32km-tough-one", true, false },
                    { "nmb-1city-marathon-2026", "NMB 1City Marathon", new DateOnly(2026, 12, 6), 42.195, "Gqeberha", "A Gqeberha road marathon starting and finishing at Baywest Mall, with half, 10 km and 5 km options.", null, false, "https://runningcalendar.co.za/events/nmb-1-city-marathon", true, false },
                    { "sandton-half-marathon-2026", "Sandton Half-Marathon", new DateOnly(2026, 12, 13), 21.0975, "Sandton", "A half marathon and 10 km on Sandton roads, starting and finishing at Sandown High School.", null, false, "https://runningcalendar.co.za/events/sandton-half-marathon", true, false },
                    { "bay-to-bay-2027", "Top Form Bay to Bay Race", new DateOnly(2027, 1, 17), 30, "Cape Town", "A 30 km out-and-back from Camps Bay to Hout Bay over the long Llandudno climb, with a 15 km from Hout Bay.", "https://topformathletic.co.za/event/bay-to-bay-race/", false, "https://runningcalendar.co.za/events/cape-town-bay-to-bay", true, false },
                    { "joburg-north-city-marathon-2027", "Joburg North City Marathon", new DateOnly(2027, 2, 7), 42.195, "Johannesburg", "A two-lap marathon based at Marks Park in Emmarentia, with half, 10 km and 5 km races.", "https://joburgnorthcitymarathon.co.za/", false, "https://runningcalendar.co.za/events/joburg-north-city-marathon/2027", true, false },
                    { "nelson-mandela-bay-half-marathon-2027", "Nelson Mandela Bay Half Marathon", new DateOnly(2027, 2, 20), 21.0975, "Gqeberha", "A seafront half marathon starting and finishing at Pollok Beach in Summerstrand.", null, false, "https://runningcalendar.co.za/events/nmb-half-marathon", true, false },
                    { "peninsula-marathon-2027", "Balwin Sport Peninsula Marathon", new DateOnly(2027, 2, 21), 42.195, "Cape Town", "A point-to-point marathon from Green Point across the peninsula to Simon's Town, with a half marathon.", "https://celticharriers.co.za/", false, "https://runningcalendar.co.za/events/cape-peninsula-marathon", true, false },
                    { "capital-city-marathon-2027", "Capital City Marathon", new DateOnly(2027, 2, 28), 42.195, "Pietermaritzburg", "A marathon from Pietermaritzburg City Hall to Msunduzi Athletics Stadium, with half, 10 km and 5 km races.", "https://capitalcity42.co.za/", true, "https://capitalcity42.co.za/", true, false },
                    { "om-die-dam-2027", "Om Die Dam Ultra Marathon", new DateOnly(2027, 3, 20), 50, "Hartbeespoort", "A 50 km ultra around Hartbeespoort Dam, starting at Hartbeespoort High School, with a half marathon.", "https://omdiedammarathon.co.za/", true, "https://omdiedammarathon.co.za/", true, false },
                    { "two-oceans-half-marathon-2027", "Two Oceans Half Marathon", new DateOnly(2027, 4, 3), 21.0975, "Cape Town", "A half marathon from Newlands through Constantia and over Southern Cross Drive, finishing at UCT.", "https://www.twooceansmarathon.org.za/half-marathon/", true, "https://www.twooceansmarathon.org.za/half-marathon/", true, false },
                    { "loskop-marathon-2027", "Loskop Marathon", new DateOnly(2027, 4, 24), 50, "Loskop Dam", "A 50 km ultra at Loskop Dam in Mpumalanga, with 21 km trail, 10 km and fun-run options.", "http://www.loskopmarathon.co.za", false, "https://runningcalendar.co.za/events/loskop-marathon-series", true, false },
                    { "durban-international-marathon-2027", "Durban International Marathon", new DateOnly(2027, 5, 2), 42.195, "Durban", "A coastal city marathon with a 10 km, and a popular Comrades and Two Oceans qualifier.", "https://durbanmarathon.co.za/", true, "https://durbanmarathon.co.za/", true, false },
                    { "cape-town-10k-peace-run-2027", "Sanlam Cape Town 10K Peace Run", new DateOnly(2027, 5, 22), 10, "Cape Town", "A community 10 km from the Green Point stadium precinct, run the day before the Cape Town Marathon.", "https://capetownmarathon.com/peace-runs/", true, "https://capetownmarathon.com/FAQ/", true, false },
                    { "knysna-forest-marathon-2027", "Knysna Forest Marathon", new DateOnly(2027, 7, 3), 42.195, "Knysna", "A marathon mostly on forest roads through the Knysna Forest, finishing with views of the estuary and the Heads.", "https://knysnaforestmarathon.co.za/", true, "https://knysnaforestmarathon.co.za/", true, false },
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CatalogueRaces");
        }
    }
}
