using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAiCoach : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AiCoachConsent",
                table: "Runners",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AiCoachConsentChangedAt",
                table: "Runners",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AiUsageDays",
                columns: table => new
                {
                    RunnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    Calls = table.Column<int>(type: "int", nullable: false),
                    InputTokens = table.Column<long>(type: "bigint", nullable: false),
                    OutputTokens = table.Column<long>(type: "bigint", nullable: false),
                    CostMicroUsd = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiUsageDays", x => new { x.RunnerId, x.Day });
                    table.ForeignKey(
                        name: "FK_AiUsageDays_Runners_RunnerId",
                        column: x => x.RunnerId,
                        principalTable: "Runners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AiUsageDays_Day",
                table: "AiUsageDays",
                column: "Day");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AiUsageDays");

            migrationBuilder.DropColumn(
                name: "AiCoachConsent",
                table: "Runners");

            migrationBuilder.DropColumn(
                name: "AiCoachConsentChangedAt",
                table: "Runners");
        }
    }
}
