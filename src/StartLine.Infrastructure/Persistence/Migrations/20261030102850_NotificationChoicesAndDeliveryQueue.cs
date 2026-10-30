using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class NotificationChoicesAndDeliveryQueue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ConnectionAlerts",
                table: "PushSubscriptions",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "LongRunPreparation",
                table: "PushSubscriptions",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "PreparationAt",
                table: "PushSubscriptions",
                type: "time",
                nullable: false,
                defaultValue: new TimeOnly(18, 0, 0));

            migrationBuilder.AddColumn<TimeOnly>(
                name: "QuietEnd",
                table: "PushSubscriptions",
                type: "time",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "QuietStart",
                table: "PushSubscriptions",
                type: "time",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RacePreparation",
                table: "PushSubscriptions",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RunCongratulations",
                table: "PushSubscriptions",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "TrainingReviews",
                table: "PushSubscriptions",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "NotificationDeliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeviceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SubjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    EventKey = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    NotBefore = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ClaimedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NotificationDeliveries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NotificationDeliveries_PushSubscriptions_DeviceId",
                        column: x => x.DeviceId,
                        principalTable: "PushSubscriptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_NotificationDeliveries_ClaimedAt_NotBefore",
                table: "NotificationDeliveries",
                columns: new[] { "ClaimedAt", "NotBefore" });

            migrationBuilder.CreateIndex(
                name: "IX_NotificationDeliveries_DeviceId_Kind_EventKey",
                table: "NotificationDeliveries",
                columns: new[] { "DeviceId", "Kind", "EventKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "NotificationDeliveries");

            migrationBuilder.DropColumn(
                name: "ConnectionAlerts",
                table: "PushSubscriptions");

            migrationBuilder.DropColumn(
                name: "LongRunPreparation",
                table: "PushSubscriptions");

            migrationBuilder.DropColumn(
                name: "PreparationAt",
                table: "PushSubscriptions");

            migrationBuilder.DropColumn(
                name: "QuietEnd",
                table: "PushSubscriptions");

            migrationBuilder.DropColumn(
                name: "QuietStart",
                table: "PushSubscriptions");

            migrationBuilder.DropColumn(
                name: "RacePreparation",
                table: "PushSubscriptions");

            migrationBuilder.DropColumn(
                name: "RunCongratulations",
                table: "PushSubscriptions");

            migrationBuilder.DropColumn(
                name: "TrainingReviews",
                table: "PushSubscriptions");
        }
    }
}
