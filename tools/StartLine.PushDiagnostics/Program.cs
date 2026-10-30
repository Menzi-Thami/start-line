using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using StartLine.Infrastructure.Persistence;

// Operator-only CLI. Reads account/device metadata; never reads encrypted addresses or protection keys.
var target = Required("PUSH_TEST_TARGET_EMAIL");
var server = Required("SQL_SERVER");
var database = Required("SQL_DATABASE");
var appName = Required("API_APP_NAME");
await using var db = new StartLineDbContext(new DbContextOptionsBuilder<StartLineDbContext>()
    .UseSqlServer($"Server=tcp:{server},1433;Database={database};Authentication=Active Directory Default;Encrypt=True;Connect Timeout=120;",
        sql => sql.EnableRetryOnFailure()).Options);
var runners = await db.Runners.AsNoTracking().Where(r => r.Email == target).Select(r => r.Id).Take(2).ToListAsync();
if (runners.Count != 1)
{
    Console.Error.WriteLine("Schedule not created: target must resolve to exactly one runner.");
    return 1;
}

var runnerId = runners[0];
var count = await db.PushSubscriptions.CountAsync(d => d.RunnerId == runnerId);
if (count == 0)
{
    Console.Error.WriteLine("Schedule not created: no registered notification devices for this runner.");
    return 1;
}

// Freeze absolute slots once. App restarts cannot extend or repeat this test.
var first = TimeProvider.System.GetUtcNow().AddHours(1);
var path = Path.Combine(Path.GetTempPath(), $"push-test-{Guid.NewGuid():N}.json");
try
{
    var fileOptions = new FileStreamOptions
    {
        Mode = FileMode.CreateNew,
        Access = FileAccess.Write,
    };
    if (!OperatingSystem.IsWindows())
    {
        fileOptions.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
    }

    await using (var file = new FileStream(path, fileOptions))
    {
        await JsonSerializer.SerializeAsync(file, new Dictionary<string, string>
        {
            ["PushTest__TargetEmail"] = target,
            ["PushTest__FirstAt"] = first.ToString("O", CultureInfo.InvariantCulture),
        });
    }

    var start = new ProcessStartInfo("az") { RedirectStandardOutput = true, RedirectStandardError = true };
    foreach (var arg in new[] { "webapp", "config", "appsettings", "set", "-g", "rg-taperday", "-n", appName, "--settings", $"@{path}", "--output", "none" })
    {
        start.ArgumentList.Add(arg);
    }

    using var process = Process.Start(start) ?? throw new InvalidOperationException("Could not start Azure CLI.");
    var output = process.StandardOutput.ReadToEndAsync();
    var error = process.StandardError.ReadToEndAsync();
    await process.WaitForExitAsync();
    await Task.WhenAll(output, error);
    if (process.ExitCode != 0)
    {
        Console.Error.WriteLine("Schedule configuration failed. Check Azure permissions; setting values were not logged.");
        return 1;
    }

    Console.WriteLine($"Registered devices: {count.ToString(CultureInfo.InvariantCulture)}");
    Console.WriteLine($"First push UTC: {first:O}");
    Console.WriteLine($"Second push UTC: {first.AddHours(1):O}");
    Console.WriteLine("Exactly two test slots configured; no recurring schedule created. Push service acceptance is reported by the API worker separately.");
    return 0;
}
finally
{
    File.Delete(path);
}

static string Required(string name) => Environment.GetEnvironmentVariable(name) is { Length: > 0 } value
    ? value : throw new InvalidOperationException($"Missing {name}.");
