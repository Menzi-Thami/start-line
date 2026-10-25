using StartLine.Domain.Common;

namespace StartLine.Domain.Notifications;

/// <summary>
/// Where a device's pushes go, as stored: already encrypted by the application layer. The endpoint is a secret (anyone
/// holding it with the keys can push to the device), so the domain never sees it in the clear.
/// </summary>
public sealed record ProtectedPushAddress(string Endpoint, string P256dh, string Auth);

/// <summary>
/// One device a runner turned reminders on for: a reminder of the day's run at the time they picked, in their own time
/// zone, and on a Monday that a new week of their plan has started, if they want that too. Off unless the runner turns it
/// on; deleted when they turn it off, when the push service says the device is gone, and with the runner.
/// </summary>
public sealed class PushSubscription
{
    /// <summary>A runner's phone, laptop and a spare is plenty; this caps a script registering devices without end.</summary>
    public const int MaxPerRunner = 10;

    /// <summary>The encrypted endpoint or key. Endpoints are capped well below this before they're encrypted.</summary>
    public const int MaxProtectedLength = 3000;

    /// <summary>A SHA-256 of the endpoint, as hex: how one device is found again without decrypting every endpoint.</summary>
    public const int DeviceKeyLength = 64;

    private PushSubscription()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public string DeviceKey { get; private set; } = "";

    public string Endpoint { get; private set; } = "";

    public string P256dh { get; private set; } = "";

    public string Auth { get; private set; } = "";

    /// <summary>The runner's local time for the day's reminder.</summary>
    public TimeOnly RemindAt { get; private set; }

    /// <summary>Also say on a Monday that a new week has started and the coach's note on it is waiting.</summary>
    public bool WeekAhead { get; private set; }

    /// <summary>The last day (the runner's own date) a reminder went to this device, or was skipped because it was set up too late for it.</summary>
    public DateOnly? LastRemindedOn { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    /// <summary>Concurrency token: two API instances (a deploy overlapping the old one) can never both mark, and send, the same reminder.</summary>
    public byte[] Version { get; private set; } = [];

    /// <param name="localNow">The runner's own time now. Set up after today's reminder time, the first reminder is tomorrow's.</param>
    public static PushSubscription Start(Guid runnerId, string deviceKey, ProtectedPushAddress address, TimeOnly remindAt, bool weekAhead, DateTime localNow)
    {
        if (runnerId == Guid.Empty)
        {
            throw new DomainException("Reminders belong to a runner.");
        }

        if (deviceKey is not { Length: DeviceKeyLength })
        {
            throw new DomainException("A device needs its key.");
        }

        var subscription = new PushSubscription { Id = Guid.NewGuid(), RunnerId = runnerId, DeviceKey = deviceKey };
        subscription.Change(address, remindAt, weekAhead, localNow);
        return subscription;
    }

    /// <summary>
    /// A new time or choice, or new keys from the browser. A change takes effect from the next reminder time: moved to a
    /// time that's already gone today, nothing is sent for today, so a change never sends a reminder straight away.
    /// </summary>
    public void Change(ProtectedPushAddress address, TimeOnly remindAt, bool weekAhead, DateTime localNow)
    {
        ArgumentNullException.ThrowIfNull(address);
        if (string.IsNullOrEmpty(address.Endpoint) || string.IsNullOrEmpty(address.P256dh) || string.IsNullOrEmpty(address.Auth))
        {
            throw new DomainException("A device needs its push address and both keys.");
        }

        if (address.Endpoint.Length > MaxProtectedLength || address.P256dh.Length > MaxProtectedLength || address.Auth.Length > MaxProtectedLength)
        {
            throw new DomainException("That push address is longer than any browser issues.");
        }

        Endpoint = address.Endpoint;
        P256dh = address.P256dh;
        Auth = address.Auth;
        RemindAt = remindAt;
        WeekAhead = weekAhead;

        var today = DateOnly.FromDateTime(localNow);
        if (TimeOnly.FromDateTime(localNow) >= remindAt && (LastRemindedOn is null || LastRemindedOn < today))
        {
            LastRemindedOn = today;
        }
    }

    /// <summary>
    /// Records the day's reminder as sent. Called before it's sent, so a crash part-way can never send it twice; a push
    /// that then fails is missed rather than repeated.
    /// </summary>
    public void MarkReminded(DateOnly day)
    {
        if (LastRemindedOn is { } last && day <= last)
        {
            throw new DomainException("That day's reminder has already gone.");
        }

        LastRemindedOn = day;
    }
}
