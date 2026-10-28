using Microsoft.Data.SqlClient;

namespace StartLine.Integration.Tests;

/// <summary>The integration suite resets every table. Refuse production and remote connections before starting a host.</summary>
internal static class TestDatabaseSafety
{
    public static void RequireDisposableLocal(string connectionString)
    {
        var builder = new SqlConnectionStringBuilder(connectionString);
        var server = builder.DataSource;
        var localDb = server.StartsWith("(localdb)\\", StringComparison.OrdinalIgnoreCase);
        if (server.StartsWith("tcp:", StringComparison.OrdinalIgnoreCase))
        {
            server = server[4..];
        }

        var host = server.Split(',')[0].Split('\\')[0].Trim('[', ']');
        var local = localDb || host is "." or "(local)" or "127.0.0.1" or "::1" || string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase);
        var testName = builder.InitialCatalog.Contains("test", StringComparison.OrdinalIgnoreCase)
            || builder.InitialCatalog.StartsWith("StartLineCheck", StringComparison.OrdinalIgnoreCase);
        if (!local || !testName)
        {
            throw new InvalidOperationException("Integration tests reset database contents. Use a disposable local SQL/LocalDB database with Test in its name; production and remote databases are forbidden. See docs/testing.md.");
        }
    }
}

public sealed class TestDatabaseSafetyTests
{
    [Theory]
    [InlineData("Server=localhost,1433;Database=Taperday_IntegrationTests;Integrated Security=true")]
    [InlineData("Server=(localdb)\\MSSQLLocalDB;Database=StartLine_IntegrationTests;Integrated Security=true")]
    [InlineData("Server=tcp:127.0.0.1,1433;Database=StartLineCheck20261028;Integrated Security=true")]
    public void A_local_disposable_test_database_is_allowed(string connection) =>
        Should.NotThrow(() => TestDatabaseSafety.RequireDisposableLocal(connection));

    [Theory]
    [InlineData("Server=production.database.windows.net;Database=TaperdayTests;Integrated Security=true")]
    [InlineData("Server=localhost,1433;Database=Taperday;Integrated Security=true")]
    [InlineData("Server=localhost;Database=master;Integrated Security=true")]
    public void A_remote_host_or_ordinary_app_database_is_refused_before_connecting(string connection) =>
        Should.Throw<InvalidOperationException>(() => TestDatabaseSafety.RequireDisposableLocal(connection));
}
