using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SavedPlanRaceSnapshotsAndOfflineCheckIns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "RaceName", table: "SavedPlans", type: "nvarchar(120)", maxLength: 120, nullable: true,
                oldClrType: typeof(string), oldType: "nvarchar(100)", oldMaxLength: 100, oldNullable: true);

            migrationBuilder.Sql("""
                UPDATE p SET RaceName = COALESCE(p.RaceName, r.Name),
                    DistanceKm = COALESCE(p.DistanceKm, r.DistanceKm), RaceDate = COALESCE(p.RaceDate, r.Date)
                FROM SavedPlans p INNER JOIN CatalogueRaces r ON p.RaceSlug = r.Slug
                WHERE p.RaceName IS NULL OR p.DistanceKm IS NULL OR p.RaceDate IS NULL;
                """);

            migrationBuilder.Sql("""
                UPDATE p SET RaceName = COALESCE(p.RaceName, r.Name), DistanceKm = COALESCE(p.DistanceKm, r.DistanceKm),
                    RaceDate = COALESCE(p.RaceDate, r.RaceDate)
                FROM SavedPlans p INNER JOIN (VALUES
                    (N'two-oceans-ultra-2027', N'Two Oceans Ultra', CAST('2027-04-04' AS date), 56),
                    (N'cape-town-marathon-2027', N'Cape Town Marathon', CAST('2027-05-23' AS date), 42.195),
                    (N'comrades-2027', N'Comrades Marathon', CAST('2027-06-13' AS date), 90),
                    (N'cape100-2027', N'Cape100', CAST('2027-09-05' AS date), 100)
                ) r(Slug, Name, RaceDate, DistanceKm) ON p.RaceSlug = r.Slug
                WHERE p.RaceName IS NULL OR p.DistanceKm IS NULL OR p.RaceDate IS NULL;
                """);

            migrationBuilder.AddColumn<byte[]>(
                name: "Version",
                table: "SessionCheckIns",
                type: "rowversion",
                rowVersion: true,
                nullable: false,
                defaultValue: new byte[0]);

            migrationBuilder.AddColumn<DateOnly>(
                name: "RecentResultDate",
                table: "SavedPlans",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "RecentResultKm",
                table: "SavedPlans",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "RecentResultSeconds",
                table: "SavedPlans",
                type: "bigint",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "RaceName", table: "SavedPlans", type: "nvarchar(100)", maxLength: 100, nullable: true,
                oldClrType: typeof(string), oldType: "nvarchar(120)", oldMaxLength: 120, oldNullable: true);

            migrationBuilder.DropColumn(
                name: "Version",
                table: "SessionCheckIns");

            migrationBuilder.DropColumn(
                name: "RecentResultDate",
                table: "SavedPlans");

            migrationBuilder.DropColumn(
                name: "RecentResultKm",
                table: "SavedPlans");

            migrationBuilder.DropColumn(
                name: "RecentResultSeconds",
                table: "SavedPlans");
        }
    }
}
