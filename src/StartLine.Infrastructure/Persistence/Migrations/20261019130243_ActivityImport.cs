using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ActivityImport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Activities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    LocalDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    DistanceMetres = table.Column<double>(type: "float", nullable: false),
                    MovingSeconds = table.Column<double>(type: "float", nullable: false),
                    ElapsedSeconds = table.Column<double>(type: "float", nullable: false),
                    ElevationGainMetres = table.Column<double>(type: "float", nullable: true),
                    AverageHeartRate = table.Column<int>(type: "int", nullable: true),
                    MaxHeartRate = table.Column<int>(type: "int", nullable: true),
                    Calories = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    FirstHalfSeconds = table.Column<double>(type: "float", nullable: false),
                    HalfMetres = table.Column<double>(type: "float", nullable: false),
                    SecondHalfSeconds = table.Column<double>(type: "float", nullable: false),
                    PlannedDistanceKm = table.Column<double>(type: "float", nullable: true),
                    PlannedFastestPace = table.Column<double>(type: "float", nullable: true),
                    PlannedPlanName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    PlannedSessionType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    PlannedSlowestPace = table.Column<double>(type: "float", nullable: true),
                    PlannedTitle = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Activities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Activities_Runners_RunnerId",
                        column: x => x.RunnerId,
                        principalTable: "Runners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ActivityBestEfforts",
                columns: table => new
                {
                    DistanceMetres = table.Column<double>(type: "float", nullable: false),
                    ActivityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ElapsedSeconds = table.Column<double>(type: "float", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActivityBestEfforts", x => new { x.ActivityId, x.DistanceMetres });
                    table.ForeignKey(
                        name: "FK_ActivityBestEfforts_Activities_ActivityId",
                        column: x => x.ActivityId,
                        principalTable: "Activities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ActivitySplits",
                columns: table => new
                {
                    Number = table.Column<int>(type: "int", nullable: false),
                    ActivityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DistanceMetres = table.Column<double>(type: "float", nullable: false),
                    MovingSeconds = table.Column<double>(type: "float", nullable: false),
                    ElevationChangeMetres = table.Column<double>(type: "float", nullable: true),
                    AverageHeartRate = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActivitySplits", x => new { x.ActivityId, x.Number });
                    table.ForeignKey(
                        name: "FK_ActivitySplits_Activities_ActivityId",
                        column: x => x.ActivityId,
                        principalTable: "Activities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Activities_RunnerId_StartedAt",
                table: "Activities",
                columns: new[] { "RunnerId", "StartedAt" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ActivityBestEfforts");

            migrationBuilder.DropTable(
                name: "ActivitySplits");

            migrationBuilder.DropTable(
                name: "Activities");
        }
    }
}
