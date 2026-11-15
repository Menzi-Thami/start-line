using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class IndependentRaceHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RaceResults_SavedPlans_SavedPlanId",
                table: "RaceResults");

            migrationBuilder.DropIndex(
                name: "IX_RaceResults_SavedPlanId",
                table: "RaceResults");

            migrationBuilder.AlterColumn<Guid>(
                name: "SavedPlanId",
                table: "RaceResults",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<double>(
                name: "EventDistanceKm",
                table: "RaceResults",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EventName",
                table: "RaceResults",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Major",
                table: "RaceResults",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RaceKey",
                table: "RaceResults",
                type: "nvarchar(180)",
                maxLength: 180,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TimeKind",
                table: "RaceResults",
                type: "nvarchar(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "Unspecified");

            migrationBuilder.CreateIndex(
                name: "IX_RaceResults_RunnerId_ActivityId",
                table: "RaceResults",
                columns: new[] { "RunnerId", "ActivityId" },
                unique: true,
                filter: "[ActivityId] IS NOT NULL AND [RaceKey] IS NOT NULL");

            // Preserve recoverable event identity before the result becomes independent of the training chapter.
            // Unknown time sources stay Unspecified; neither an activity link nor a finish time proves chip timing.
            // Legacy keys stay nullable, so pre-existing duplicate chapters migrate without discarding their evidence.
            migrationBuilder.Sql("""
                UPDATE r SET EventName = COALESCE(NULLIF(r.EventName, N''), NULLIF(p.RaceName, N''), c.Name, p.Name),
                    EventDistanceKm = COALESCE(r.EventDistanceKm, p.DistanceKm, c.DistanceKm)
                FROM RaceResults r INNER JOIN SavedPlans p ON r.SavedPlanId = p.Id
                    LEFT JOIN CatalogueRaces c ON p.RaceSlug = c.Slug
                WHERE r.EventName = N'' OR r.EventDistanceKm IS NULL;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_RaceResults_RunnerId_RaceKey",
                table: "RaceResults",
                columns: new[] { "RunnerId", "RaceKey" },
                unique: true,
                filter: "[RaceKey] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_RaceResults_SavedPlanId",
                table: "RaceResults",
                column: "SavedPlanId",
                unique: true,
                filter: "[SavedPlanId] IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_RaceResults_Runners_RunnerId",
                table: "RaceResults",
                column: "RunnerId",
                principalTable: "Runners",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_RaceResults_SavedPlans_SavedPlanId",
                table: "RaceResults",
                column: "SavedPlanId",
                principalTable: "SavedPlans",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // An old schema cannot represent independent races. Refuse rollback rather than delete a runner's history.
            migrationBuilder.Sql("IF EXISTS (SELECT 1 FROM RaceResults WHERE SavedPlanId IS NULL) THROW 50001, 'Independent race history must be exported or migrated before schema rollback.', 1;");
            migrationBuilder.DropForeignKey(
                name: "FK_RaceResults_Runners_RunnerId",
                table: "RaceResults");

            migrationBuilder.DropForeignKey(
                name: "FK_RaceResults_SavedPlans_SavedPlanId",
                table: "RaceResults");

            migrationBuilder.DropIndex(
                name: "IX_RaceResults_RunnerId_ActivityId",
                table: "RaceResults");

            migrationBuilder.DropIndex(
                name: "IX_RaceResults_RunnerId_RaceKey",
                table: "RaceResults");

            migrationBuilder.DropIndex(
                name: "IX_RaceResults_SavedPlanId",
                table: "RaceResults");

            migrationBuilder.DropColumn(
                name: "EventDistanceKm",
                table: "RaceResults");

            migrationBuilder.DropColumn(
                name: "EventName",
                table: "RaceResults");

            migrationBuilder.DropColumn(
                name: "Major",
                table: "RaceResults");

            migrationBuilder.DropColumn(
                name: "RaceKey",
                table: "RaceResults");

            migrationBuilder.DropColumn(
                name: "TimeKind",
                table: "RaceResults");

            migrationBuilder.AlterColumn<Guid>(
                name: "SavedPlanId",
                table: "RaceResults",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_RaceResults_SavedPlanId",
                table: "RaceResults",
                column: "SavedPlanId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_RaceResults_SavedPlans_SavedPlanId",
                table: "RaceResults",
                column: "SavedPlanId",
                principalTable: "SavedPlans",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
