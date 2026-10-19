using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class StravaSync : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CachedUntil",
                table: "Activities",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExternalId",
                table: "Activities",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RecordedOnGarmin",
                table: "Activities",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Source",
                table: "Activities",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Upload");

            migrationBuilder.CreateTable(
                name: "DataProtectionKeys",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FriendlyName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Xml = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DataProtectionKeys", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProviderConnections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Provider = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    ExternalAthleteId = table.Column<long>(type: "bigint", nullable: false),
                    Scopes = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AccessToken = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    RefreshToken = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    AccessTokenExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    ConnectedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    LastSyncedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    LastCatchUpAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProviderConnections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProviderConnections_Runners_RunnerId",
                        column: x => x.RunnerId,
                        principalTable: "Runners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SyncJobs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Provider = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    ObjectId = table.Column<long>(type: "bigint", nullable: true),
                    Priority = table.Column<int>(type: "int", nullable: false),
                    NotBefore = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Attempts = table.Column<int>(type: "int", nullable: false),
                    LastError = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Failed = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncJobs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SyncJobs_Runners_RunnerId",
                        column: x => x.RunnerId,
                        principalTable: "Runners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Activities_CachedUntil",
                table: "Activities",
                column: "CachedUntil",
                filter: "[CachedUntil] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Activities_RunnerId_Source_ExternalId",
                table: "Activities",
                columns: new[] { "RunnerId", "Source", "ExternalId" });

            migrationBuilder.CreateIndex(
                name: "IX_ProviderConnections_Provider_ExternalAthleteId",
                table: "ProviderConnections",
                columns: new[] { "Provider", "ExternalAthleteId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProviderConnections_RunnerId_Provider",
                table: "ProviderConnections",
                columns: new[] { "RunnerId", "Provider" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncJobs_Failed_NotBefore_Priority",
                table: "SyncJobs",
                columns: new[] { "Failed", "NotBefore", "Priority" });

            migrationBuilder.CreateIndex(
                name: "IX_SyncJobs_RunnerId_Kind_ObjectId",
                table: "SyncJobs",
                columns: new[] { "RunnerId", "Kind", "ObjectId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DataProtectionKeys");

            migrationBuilder.DropTable(
                name: "ProviderConnections");

            migrationBuilder.DropTable(
                name: "SyncJobs");

            migrationBuilder.DropIndex(
                name: "IX_Activities_CachedUntil",
                table: "Activities");

            migrationBuilder.DropIndex(
                name: "IX_Activities_RunnerId_Source_ExternalId",
                table: "Activities");

            migrationBuilder.DropColumn(
                name: "CachedUntil",
                table: "Activities");

            migrationBuilder.DropColumn(
                name: "ExternalId",
                table: "Activities");

            migrationBuilder.DropColumn(
                name: "RecordedOnGarmin",
                table: "Activities");

            migrationBuilder.DropColumn(
                name: "Source",
                table: "Activities");
        }
    }
}
