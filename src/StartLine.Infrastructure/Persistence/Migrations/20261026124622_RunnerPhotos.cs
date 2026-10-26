using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RunnerPhotos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RunnerPhotos",
                columns: table => new
                {
                    RunnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ContentType = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    Data = table.Column<byte[]>(type: "varbinary(max)", maxLength: 98304, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RunnerPhotos", x => x.RunnerId);
                    table.ForeignKey(
                        name: "FK_RunnerPhotos_Runners_RunnerId",
                        column: x => x.RunnerId,
                        principalTable: "Runners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RunnerPhotos");
        }
    }
}
