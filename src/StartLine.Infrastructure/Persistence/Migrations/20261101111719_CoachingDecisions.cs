using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CoachingDecisions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CoachingDecisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SavedPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WeekStart = table.Column<DateOnly>(type: "date", nullable: false),
                    Outcome = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Verdict = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Reasons = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    ChangedPlan = table.Column<bool>(type: "bit", nullable: false),
                    Recovery = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    DecidedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoachingDecisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoachingDecisions_SavedPlans_SavedPlanId",
                        column: x => x.SavedPlanId,
                        principalTable: "SavedPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CoachingDecisions_SavedPlanId_DecidedAt",
                table: "CoachingDecisions",
                columns: new[] { "SavedPlanId", "DecidedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CoachingDecisions");
        }
    }
}
