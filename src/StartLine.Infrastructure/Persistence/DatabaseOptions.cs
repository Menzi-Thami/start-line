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
        // Retries let migrations ride out Azure SQL's free tier waking from auto-pause, as the app itself does.
        return new StartLineDbContext(new DbContextOptionsBuilder<StartLineDbContext>()
            .UseSqlServer(connection, sql => sql.EnableRetryOnFailure(maxRetryCount: 6, maxRetryDelay: TimeSpan.FromSeconds(30), errorNumbersToAdd: null))
            .Options);
    }
}
