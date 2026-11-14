using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRunningJourney : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Achievements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SavedPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    EarnedOn = table.Column<DateOnly>(type: "date", nullable: false),
                    AwardedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CelebratedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Achievements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Achievements_SavedPlans_SavedPlanId",
                        column: x => x.SavedPlanId,
                        principalTable: "SavedPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MaintenancePlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DaysPerWeek = table.Column<int>(type: "int", nullable: false),
                    RunDays = table.Column<int>(type: "int", nullable: false),
                    IncludeStrength = table.Column<bool>(type: "bit", nullable: false),
                    StartedOn = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    GeneratorVersion = table.Column<int>(type: "int", nullable: false),
                    EndedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MaintenancePlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MaintenancePlans_Runners_RunnerId",
                        column: x => x.RunnerId,
                        principalTable: "Runners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RaceResults",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SavedPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Outcome = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    RaceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    FinishSeconds = table.Column<long>(type: "bigint", nullable: true),
                    DistanceKm = table.Column<double>(type: "float", nullable: true),
                    ActivityId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Note = table.Column<string>(type: "nvarchar(280)", maxLength: 280, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RaceResults", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RaceResults_SavedPlans_SavedPlanId",
                        column: x => x.SavedPlanId,
                        principalTable: "SavedPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RecoveryPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SavedPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EventName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    DistanceKm = table.Column<double>(type: "float", nullable: false),
                    RaceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Effort = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Preference = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    RunDays = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    GeneratorVersion = table.Column<int>(type: "int", nullable: false),
                    ExtraDays = table.Column<int>(type: "int", nullable: false),
                    Pauses = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CheckIns = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EndedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecoveryPlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RecoveryPlans_Runners_RunnerId",
                        column: x => x.RunnerId,
                        principalTable: "Runners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Achievements_RunnerId_SavedPlanId_Kind",
                table: "Achievements",
                columns: new[] { "RunnerId", "SavedPlanId", "Kind" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Achievements_SavedPlanId",
                table: "Achievements",
                column: "SavedPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_MaintenancePlans_OneActivePerRunner",
                table: "MaintenancePlans",
                column: "RunnerId",
                unique: true,
                filter: "[Status] = 'Active'");

            migrationBuilder.CreateIndex(
                name: "IX_RaceResults_RunnerId",
                table: "RaceResults",
                column: "RunnerId");

            migrationBuilder.CreateIndex(
                name: "IX_RaceResults_SavedPlanId",
                table: "RaceResults",
                column: "SavedPlanId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RecoveryPlans_OneOpenPerRunner",
                table: "RecoveryPlans",
                column: "RunnerId",
                unique: true,
                filter: "[Status] IN ('Active', 'Paused')");

            migrationBuilder.CreateIndex(
                name: "IX_RecoveryPlans_OnePerPlan",
                table: "RecoveryPlans",
                columns: new[] { "RunnerId", "SavedPlanId" },
                unique: true,
                filter: "[SavedPlanId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Achievements");

            migrationBuilder.DropTable(
                name: "MaintenancePlans");

            migrationBuilder.DropTable(
                name: "RaceResults");

            migrationBuilder.DropTable(
                name: "RecoveryPlans");
        }
    }
}
