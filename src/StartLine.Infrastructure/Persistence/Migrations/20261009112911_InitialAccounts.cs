using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Runners",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IdentitySubject = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Email = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: true),
                    DisplayName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    TimeZone = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Units = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    WeeklyEmails = table.Column<bool>(type: "bit", nullable: false),
                    PrivacyNoticeVersion = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ConsentedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Runners", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SavedPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CurrentWeeklyKm = table.Column<double>(type: "float", nullable: true),
                    DistanceKm = table.Column<double>(type: "float", nullable: true),
                    Experience = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    GoalSeconds = table.Column<long>(type: "bigint", nullable: false),
                    LongRunDay = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    PlanFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    RaceDate = table.Column<DateOnly>(type: "date", nullable: true),
                    RaceName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    RaceSlug = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    RunDays = table.Column<int>(type: "int", nullable: false),
                    StrengthDays = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavedPlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SavedPlans_Runners_RunnerId",
                        column: x => x.RunnerId,
                        principalTable: "Runners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Runners_IdentitySubject",
                table: "Runners",
                column: "IdentitySubject",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SavedPlans_RunnerId_Status_UpdatedAt",
                table: "SavedPlans",
                columns: new[] { "RunnerId", "Status", "UpdatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SavedPlans");

            migrationBuilder.DropTable(
                name: "Runners");
        }
    }
}
