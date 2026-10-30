using StartLine.Domain.Common;

namespace StartLine.Domain.Runners;

/// <summary>A note a runner sent from the app: what they said and which page they were on. Read by Taperday's maker only.</summary>
public sealed class Feedback
{
    public const int MaxMessageLength = 2000;
    public const int MaxPageLength = 64;

    private Feedback()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public string Message { get; private set; } = "";

    public string Page { get; private set; } = "";

    public DateTimeOffset CreatedAt { get; private set; }

    public static Feedback From(Guid runnerId, string message, string? page, DateTimeOffset now)
    {
        var text = message?.Trim() ?? "";
        if (runnerId == Guid.Empty || text.Length == 0 || text.Length > MaxMessageLength)
        {
            throw new DomainException($"Feedback needs a message of up to {MaxMessageLength} characters.");
        }

        var where = (page ?? "").Trim();
        return new Feedback
        {
            Id = Guid.NewGuid(),
            RunnerId = runnerId,
            Message = text,
            Page = where.Length > MaxPageLength ? where[..MaxPageLength] : where,
            CreatedAt = now,
        };
    }
}
