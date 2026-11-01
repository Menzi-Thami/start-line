using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace StartLine.Infrastructure.Persistence.Migrations;

[DbContext(typeof(StartLineDbContext))]
[Migration("20261102004500_AddBeginnerProgress")]
public sealed class AddBeginnerProgress : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "BeginnerProgressJson",
            table: "Runners",
            type: "nvarchar(max)",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "BeginnerProgressJson", table: "Runners");
    }
}
