using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ReplanFromHere : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "RecentWeeklyKm",
                table: "SavedPlans",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "ReplanFrom",
                table: "SavedPlans",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Setback",
                table: "SavedPlans",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RecentWeeklyKm",
                table: "SavedPlans");

            migrationBuilder.DropColumn(
                name: "ReplanFrom",
                table: "SavedPlans");

            migrationBuilder.DropColumn(
                name: "Setback",
                table: "SavedPlans");
        }
    }
}
