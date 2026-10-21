using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CoachFitness : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "FitnessSeconds",
                table: "CoachWeeks",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "PaceFactor",
                table: "CoachWeeks",
                type: "float",
                nullable: false,
                defaultValue: 1.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FitnessSeconds",
                table: "CoachWeeks");

            migrationBuilder.DropColumn(
                name: "PaceFactor",
                table: "CoachWeeks");
        }
    }
}
