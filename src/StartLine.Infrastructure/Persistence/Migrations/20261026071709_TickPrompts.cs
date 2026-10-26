using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TickPrompts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TickPrompts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SavedPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    SessionType = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TickPrompts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TickPrompts_SavedPlans_SavedPlanId",
                        column: x => x.SavedPlanId,
                        principalTable: "SavedPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TickPrompts_Date",
                table: "TickPrompts",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "IX_TickPrompts_SavedPlanId_Date_SessionType",
                table: "TickPrompts",
                columns: new[] { "SavedPlanId", "Date", "SessionType" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TickPrompts");
        }
    }
}
