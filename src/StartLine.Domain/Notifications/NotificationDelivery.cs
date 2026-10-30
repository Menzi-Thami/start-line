using StartLine.Domain.Common;

namespace StartLine.Domain.Notifications;

public enum NotificationKind
{
    RunCongratulations,
    TrainingReview,
    LongRunPreparation,
    RacePreparation,
    ConnectionAlert,
}

/// <summary>A per-device event and delivery claim. Payloads and provider secrets are never stored here.</summary>
public sealed class NotificationDelivery
{
    private NotificationDelivery() { }

    public Guid Id { get; private set; }
    public Guid DeviceId { get; private set; }
    public Guid SubjectId { get; private set; }
    public NotificationKind Kind { get; private set; }
    public string EventKey { get; private set; } = "";
    public DateTimeOffset NotBefore { get; private set; }
    public DateTimeOffset ExpiresAt { get; private set; }
    public DateTimeOffset? ClaimedAt { get; private set; }
    public byte[] Version { get; private set; } = [];

    public static NotificationDelivery Create(Guid deviceId, Guid subjectId, NotificationKind kind, string eventKey,
        DateTimeOffset notBefore, DateTimeOffset expiresAt)
    {
        if (deviceId == Guid.Empty || subjectId == Guid.Empty || !Enum.IsDefined(kind)
            || string.IsNullOrWhiteSpace(eventKey) || eventKey.Length > 160 || expiresAt <= notBefore)
        {
            throw new DomainException("A notification needs a device, an event and a valid delivery window.");
        }

        return new()
        {
            Id = Guid.NewGuid(),
            DeviceId = deviceId,
            SubjectId = subjectId,
            Kind = kind,
            EventKey = eventKey,
            NotBefore = notBefore,
            ExpiresAt = expiresAt
        };
    }

    public void Defer(DateTimeOffset until) => NotBefore = until;

    public void Claim(DateTimeOffset now)
    {
        if (ClaimedAt is not null || now < NotBefore || now >= ExpiresAt)
        {
            throw new DomainException("That notification is not available to send.");
        }

        ClaimedAt = now;
    }
}
