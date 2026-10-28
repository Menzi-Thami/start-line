using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ActualRunLogs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SessionCheckIns_SavedPlanId_Date_SessionType",
                table: "SessionCheckIns");

            migrationBuilder.AddColumn<Guid>(
                name: "ActivityId",
                table: "SessionCheckIns",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ActualSessionType",
                table: "SessionCheckIns",
                type: "nvarchar(24)",
                maxLength: 24,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "DistanceUnreported",
                table: "SessionCheckIns",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsAdditional",
                table: "SessionCheckIns",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_SessionCheckIns_SavedPlanId_ActivityId",
                table: "SessionCheckIns",
                columns: new[] { "SavedPlanId", "ActivityId" },
                unique: true,
                filter: "[ActivityId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SessionCheckIns_SavedPlanId_Date_SessionType",
                table: "SessionCheckIns",
                columns: new[] { "SavedPlanId", "Date", "SessionType" },
                unique: true,
                filter: "[IsAdditional] = 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SessionCheckIns_SavedPlanId_ActivityId",
                table: "SessionCheckIns");

            migrationBuilder.DropIndex(
                name: "IX_SessionCheckIns_SavedPlanId_Date_SessionType",
                table: "SessionCheckIns");

            migrationBuilder.DropColumn(
                name: "ActivityId",
                table: "SessionCheckIns");

            migrationBuilder.DropColumn(
                name: "ActualSessionType",
                table: "SessionCheckIns");

            migrationBuilder.DropColumn(
                name: "DistanceUnreported",
                table: "SessionCheckIns");

            migrationBuilder.DropColumn(
                name: "IsAdditional",
                table: "SessionCheckIns");

            migrationBuilder.CreateIndex(
                name: "IX_SessionCheckIns_SavedPlanId_Date_SessionType",
                table: "SessionCheckIns",
                columns: new[] { "SavedPlanId", "Date", "SessionType" },
                unique: true);
        }
    }
}
