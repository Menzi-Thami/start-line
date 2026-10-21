using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CoachWeeks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CoachWeeks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SavedPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WeekStart = table.Column<DateOnly>(type: "date", nullable: false),
                    Verdict = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    HoldVolume = table.Column<bool>(type: "bit", nullable: false),
                    DoseStep = table.Column<int>(type: "int", nullable: false),
                    CutbackNow = table.Column<bool>(type: "bit", nullable: false),
                    Reasons = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoachWeeks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoachWeeks_SavedPlans_SavedPlanId",
                        column: x => x.SavedPlanId,
                        principalTable: "SavedPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CoachWeeks_SavedPlanId_WeekStart",
                table: "CoachWeeks",
                columns: new[] { "SavedPlanId", "WeekStart" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CoachWeeks");
        }
    }
}
