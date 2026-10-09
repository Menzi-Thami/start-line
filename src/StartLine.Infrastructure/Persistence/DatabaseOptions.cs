using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace StartLine.Infrastructure.Persistence;

public sealed class DatabaseOptions
{
    public const string ConnectionStringName = "StartLine";

    public string ConnectionString { get; set; } = "";
}

/// <summary>
/// Lets `dotnet ef` build the context without starting the app (which would also run the race sync).
/// Points at LocalDB unless STARTLINE_SQL is set. Never used at runtime.
/// </summary>
internal sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<StartLineDbContext>
{
    public StartLineDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("STARTLINE_SQL")
            ?? @"Server=(localdb)\MSSQLLocalDB;Database=StartLine;Trusted_Connection=True;TrustServerCertificate=True";
        return new StartLineDbContext(new DbContextOptionsBuilder<StartLineDbContext>().UseSqlServer(connection).Options);
    }
}
