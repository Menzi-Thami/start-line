using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RunCheckIns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SessionCheckIns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SavedPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    SessionType = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Effort = table.Column<int>(type: "int", nullable: true),
                    Pain = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    PainArea = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: true),
                    DistanceKm = table.Column<double>(type: "float", nullable: true),
                    Duration = table.Column<long>(type: "bigint", nullable: true),
                    Note = table.Column<string>(type: "nvarchar(280)", maxLength: 280, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SessionCheckIns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SessionCheckIns_SavedPlans_SavedPlanId",
                        column: x => x.SavedPlanId,
                        principalTable: "SavedPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SessionCheckIns_SavedPlanId_Date_SessionType",
                table: "SessionCheckIns",
                columns: new[] { "SavedPlanId", "Date", "SessionType" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SessionCheckIns");
        }
    }
}
