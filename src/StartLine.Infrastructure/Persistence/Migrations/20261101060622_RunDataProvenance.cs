using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RunDataProvenance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Skipped",
                table: "SyncJobs",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "FileName",
                table: "Activities",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Format",
                table: "Activities",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "DuplicateDismissals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FirstActivityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SecondActivityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DuplicateDismissals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DuplicateDismissals_Runners_RunnerId",
                        column: x => x.RunnerId,
                        principalTable: "Runners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DuplicateDismissals_RunnerId_FirstActivityId_SecondActivityId",
                table: "DuplicateDismissals",
                columns: new[] { "RunnerId", "FirstActivityId", "SecondActivityId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DuplicateDismissals");

            migrationBuilder.DropColumn(
                name: "Skipped",
                table: "SyncJobs");

            migrationBuilder.DropColumn(
                name: "FileName",
                table: "Activities");

            migrationBuilder.DropColumn(
                name: "Format",
                table: "Activities");
        }
    }
}
