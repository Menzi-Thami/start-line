using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PushReminders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PushSubscriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeviceKey = table.Column<string>(type: "char(64)", unicode: false, fixedLength: true, maxLength: 64, nullable: false),
                    Endpoint = table.Column<string>(type: "nvarchar(3000)", maxLength: 3000, nullable: false),
                    P256dh = table.Column<string>(type: "nvarchar(3000)", maxLength: 3000, nullable: false),
                    Auth = table.Column<string>(type: "nvarchar(3000)", maxLength: 3000, nullable: false),
                    RemindAt = table.Column<TimeOnly>(type: "time", nullable: false),
                    WeekAhead = table.Column<bool>(type: "bit", nullable: false),
                    LastRemindedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PushSubscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PushSubscriptions_Runners_RunnerId",
                        column: x => x.RunnerId,
                        principalTable: "Runners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PushSubscriptions_DeviceKey",
                table: "PushSubscriptions",
                column: "DeviceKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PushSubscriptions_RunnerId",
                table: "PushSubscriptions",
                column: "RunnerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PushSubscriptions");
        }
    }
}
