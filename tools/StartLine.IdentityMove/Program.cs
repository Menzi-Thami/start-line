using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using StartLine.Infrastructure.Persistence;

// Operator-only CLI (docs/password-sign-in.md, "Moving existing email-code runners").
// Microsoft can't add a password to an email-code account, so each runner gets a new Microsoft account and their
// Runners.IdentitySubject (the Microsoft object ID) is pointed at it. Plans, runs and connections hang off the runner
// row, so they move with it. Pairs come from a production secret, one "old-object-id new-object-id" per line, so no ID
// appears in inputs or logs. MOVE_MODE: check (default, changes nothing), apply, or undo (moves the same pairs back).
// All pairs move in one transaction: one bad pair stops the lot.
var mode = (Environment.GetEnvironmentVariable("MOVE_MODE") ?? "check").Trim().ToLowerInvariant();
if (mode is not ("check" or "apply" or "undo"))
{
    Console.Error.WriteLine("MOVE_MODE must be check, apply or undo.");
    return 1;
}

var pairs = ParsePairs(Required("RUNNER_IDENTITY_MOVES"), out var problem);
if (pairs is null)
{
    Console.Error.WriteLine(problem);
    return 1;
}

if (mode == "undo")
{
    pairs = [.. pairs.Select(p => (From: p.To, To: p.From))];
}

var server = Required("SQL_SERVER");
var database = Required("SQL_DATABASE");
await using var db = new StartLineDbContext(new DbContextOptionsBuilder<StartLineDbContext>()
    .UseSqlServer($"Server=tcp:{server},1433;Database={database};Authentication=Active Directory Default;Encrypt=True;Connect Timeout=120;")
    .Options);

// The free database pauses when idle and a new firewall rule can take minutes to apply: keep trying for 8 minutes.
var started = DateTimeOffset.UtcNow;
while (true)
{
    try
    {
        await db.Database.OpenConnectionAsync();
        break;
    }
    catch (SqlException ex) when (DateTimeOffset.UtcNow - started < TimeSpan.FromMinutes(8))
    {
        Console.WriteLine($"Database not reachable yet (SQL error {ex.Number}); trying again in 30 s.");
        await Task.Delay(TimeSpan.FromSeconds(30));
    }
}

var apply = mode != "check";
await using var transaction = await db.Database.BeginTransactionAsync();
int ready = 0, done = 0;
for (var i = 0; i < pairs.Count; i++)
{
    var (from, to) = pairs[i];
    var onOld = await db.Runners.CountAsync(r => r.IdentitySubject == from);
    var onNew = await db.Runners.CountAsync(r => r.IdentitySubject == to);
    if (onOld == 0 && onNew == 1)
    {
        Console.WriteLine($"Pair {i + 1}: already done.");
        done++;
        continue;
    }

    if (onOld != 1 || onNew != 0)
    {
        Console.Error.WriteLine($"Pair {i + 1}: stopped. Expected one runner on the old sign-in and none on the new one; found {onOld} and {onNew}. Nothing was changed.");
        await transaction.RollbackAsync();
        return 1;
    }

    if (apply)
    {
        var changed = await db.Runners.Where(r => r.IdentitySubject == from)
            .ExecuteUpdateAsync(set => set.SetProperty(r => r.IdentitySubject, to));
        if (changed != 1)
        {
            Console.Error.WriteLine($"Pair {i + 1}: stopped. {changed} rows changed instead of 1. Nothing was changed.");
            await transaction.RollbackAsync();
            return 1;
        }
    }

    Console.WriteLine($"Pair {i + 1}: {(apply ? "moved" : "ready")}.");
    ready++;
}

if (apply)
{
    await transaction.CommitAsync();
}
else
{
    await transaction.RollbackAsync();
}

Console.WriteLine($"{mode}: {ready} {(apply ? "moved" : "ready to move")}, {done} already done, {pairs.Count} in total.");
return 0;

static string Required(string name) =>
    Environment.GetEnvironmentVariable(name) is { Length: > 0 } value ? value : throw new InvalidOperationException($"{name} is not set.");

static List<(string From, string To)>? ParsePairs(string text, out string problem)
{
    var pairs = new List<(string From, string To)>();
    var seen = new HashSet<string>(StringComparer.Ordinal);
    var lines = text.Split('\n');
    for (var n = 0; n < lines.Length; n++)
    {
        var line = lines[n].Trim();
        if (line.Length == 0 || line.StartsWith('#'))
        {
            continue;
        }

        var parts = line.Split([' ', '\t', ','], StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 2 || !Guid.TryParse(parts[0], out var from) || !Guid.TryParse(parts[1], out var to))
        {
            problem = $"Line {n + 1}: expected two object IDs.";
            return null;
        }

        var (a, b) = (from.ToString("D"), to.ToString("D"));
        if (a == b || !seen.Add(a) || !seen.Add(b))
        {
            problem = $"Line {n + 1}: every object ID may appear only once.";
            return null;
        }

        pairs.Add((a, b));
    }

    problem = pairs.Count == 0 ? "No pairs given." : "";
    return pairs.Count == 0 ? null : pairs;
}
