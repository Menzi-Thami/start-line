using System.Text.Json;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Account;

namespace StartLine.Application.Features.Beginner;

public sealed record BeginnerProgressState(
    DateOnly StartedOn,
    IReadOnlyList<DayOfWeek> Days,
    IReadOnlyList<string> Completed,
    int Week,
    bool Paused,
    int Revision);

public sealed record ReadBeginnerProgressQuery : IRequest<BeginnerProgressState?>;

internal sealed class ReadBeginnerProgressHandler(CurrentRunner current)
    : IRequestHandler<ReadBeginnerProgressQuery, BeginnerProgressState?>
{
    public async Task<BeginnerProgressState?> Handle(ReadBeginnerProgressQuery query, CancellationToken cancellationToken)
    {
        var runner = await current.RequireAsync(cancellationToken);
        return string.IsNullOrWhiteSpace(runner.BeginnerProgressJson)
            ? null : JsonSerializer.Deserialize<BeginnerProgressState>(runner.BeginnerProgressJson);
    }
}

public sealed record SaveBeginnerProgressCommand(BeginnerProgressState Progress) : IRequest<BeginnerProgressState>;

internal sealed class SaveBeginnerProgressHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider clock)
    : IRequestHandler<SaveBeginnerProgressCommand, BeginnerProgressState>
{
    public async Task<BeginnerProgressState> Handle(SaveBeginnerProgressCommand command, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var progress = command.Progress ?? throw new ArgumentException("A programme is required.");
        if (progress.Days is null || progress.Days.Count != 3 || progress.Days.Distinct().Count() != 3 ||
            progress.Days.Any(day => !Enum.IsDefined(day)) ||
            progress.Week is < 1 or > 9 || progress.Revision is < 0 or > 999 ||
            progress.Completed is null || progress.Completed.Count > 27 ||
            progress.Completed.Any(id => id is null || id.Length > 32 || !System.Text.RegularExpressions.Regex.IsMatch(id, @"^\d+:[1-9]:[123]$")) ||
            progress.StartedOn == default || progress.StartedOn > DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime).AddYears(1))
            throw new ArgumentException("Invalid beginner programme progress.");

        var offsets = progress.Days.Select(day => ((int)day + 6) % 7).Order().ToArray();
        if (offsets.Where((day, index) => ((offsets[(index + 1) % 3] - day + 7) % 7) < 2).Any())
            throw new ArgumentException("Keep at least one rest day between running days.");

        runner.SaveBeginnerProgress(JsonSerializer.Serialize(progress));
        await db.SaveChangesAsync(cancellationToken);
        return progress;
    }
}
