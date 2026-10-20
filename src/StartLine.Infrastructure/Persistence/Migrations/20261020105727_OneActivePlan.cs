using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class OneActivePlan : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Runners with several plans keep the one they touched last as current; the rest become past plans.
            migrationBuilder.Sql("""
                WITH ranked AS (
                    SELECT Id, ROW_NUMBER() OVER (PARTITION BY RunnerId ORDER BY UpdatedAt DESC, Id DESC) AS n
                    FROM SavedPlans
                    WHERE Status = 'Active')
                UPDATE SavedPlans SET Status = 'Archived' WHERE Id IN (SELECT Id FROM ranked WHERE n > 1);
                """);

            migrationBuilder.CreateIndex(
                name: "IX_SavedPlans_OneActivePerRunner",
                table: "SavedPlans",
                column: "RunnerId",
                unique: true,
                filter: "[Status] = 'Active'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SavedPlans_OneActivePerRunner",
                table: "SavedPlans");
        }
    }
}
