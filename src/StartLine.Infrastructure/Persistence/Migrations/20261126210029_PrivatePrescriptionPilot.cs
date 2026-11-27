using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PrivatePrescriptionPilot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GymCompletions",
                table: "SavedPlans",
                type: "nvarchar(max)",
                nullable: false,
                defaultValueSql: "N'[]'");

            migrationBuilder.AddColumn<string>(
                name: "GymMoves",
                table: "SavedPlans",
                type: "nvarchar(max)",
                nullable: false,
                defaultValueSql: "N'[]'");

            migrationBuilder.AddColumn<string>(
                name: "Prescription",
                table: "SavedPlans",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "PrivatePrescriptionsEnabled",
                table: "Runners",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "PrivatePlanImports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Inputs = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Prescription = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ExpectedActiveId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ExpectedActiveVersion = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: true),
                    TokenHash = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false),
                    ReviewedOn = table.Column<DateOnly>(type: "date", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ActivatedPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrivatePlanImports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PrivatePlanImports_Runners_RunnerId",
                        column: x => x.RunnerId,
                        principalTable: "Runners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PrivatePlanImports_RunnerId_ExpiresAt",
                table: "PrivatePlanImports",
                columns: new[] { "RunnerId", "ExpiresAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PrivatePlanImports");

            migrationBuilder.DropColumn(
                name: "GymCompletions",
                table: "SavedPlans");

            migrationBuilder.DropColumn(
                name: "GymMoves",
                table: "SavedPlans");

            migrationBuilder.DropColumn(
                name: "Prescription",
                table: "SavedPlans");

            migrationBuilder.DropColumn(
                name: "PrivatePrescriptionsEnabled",
                table: "Runners");
        }
    }
}
