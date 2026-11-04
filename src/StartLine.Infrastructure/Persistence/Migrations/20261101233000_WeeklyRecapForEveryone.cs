using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StartLine.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// The weekly recap becomes on unless a runner turns it off: every existing runner gets it. Data only, so the model
    /// (and the snapshot) are unchanged. Going down can't tell who had it on before, so it leaves everyone as they are.
    /// </summary>
    [DbContext(typeof(StartLineDbContext))]
    [Migration("20261101233000_WeeklyRecapForEveryone")]
    public partial class WeeklyRecapForEveryone : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE [Runners] SET [WeeklyEmails] = 1 WHERE [WeeklyEmails] = 0;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
