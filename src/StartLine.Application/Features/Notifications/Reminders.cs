using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Domain.Notifications;

namespace StartLine.Application.Features.Notifications;

/// <summary>
/// One device with reminders on. Never its push address or keys: <c>DeviceKey</c> is a hash of the address, so the
/// browser can tell which entry is itself without the API ever handing an address back.
/// </summary>
public sealed record ReminderDeviceDto(Guid Id, string DeviceKey, TimeOnly RemindAt, bool WeekAhead, DateTimeOffset CreatedAt)
{
    public static ReminderDeviceDto From(PushSubscription s)
    {
        ArgumentNullException.ThrowIfNull(s);
        return new(s.Id, s.DeviceKey, s.RemindAt, s.WeekAhead, s.CreatedAt);
    }
}

/// <param name="Available">False until push is configured on the server; the app then doesn't offer reminders.</param>
/// <param name="PublicKey">The VAPID public key a browser subscribes with.</param>
public sealed record RemindersDto(bool Available, string? PublicKey, IReadOnlyList<ReminderDeviceDto> Devices);

internal static class PushDevices
{
    /// <summary>Browsers' endpoints run to a few hundred characters; anything far longer isn't one.</summary>
    public const int MaxEndpointLength = 1000;

    /// <summary>An uncompressed P-256 public key: 0x04, then x and y.</summary>
    public const int P256dhBytes = 65;

    public const int AuthBytes = 16;

    /// <summary>How a device is found again: SHA-256 of its endpoint, lower-case hex. The browser works out the same.</summary>
    public static string KeyOf(string endpoint) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(endpoint)));

    public static bool IsBase64UrlOf(string? value, int bytes) =>
        value is not null && Base64Url.IsValid(value, out var length) && length == bytes;
}

/// <summary>Whether reminders can be turned on here, and the runner's devices that have them.</summary>
public sealed record GetRemindersQuery : IRequest<RemindersDto>;

internal sealed class GetRemindersHandler(IApplicationDbContext db, CurrentRunner current, IPushSettings settings)
    : IRequestHandler<GetRemindersQuery, RemindersDto>
{
    public async Task<RemindersDto> Handle(GetRemindersQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        var devices = runner is null
            ? []
            : await db.PushSubscriptions.AsNoTracking()
                .Where(s => s.RunnerId == runner.Id)
                .OrderBy(s => s.CreatedAt)
                .ToListAsync(cancellationToken);
        return new RemindersDto(settings.IsEnabled, settings.IsEnabled ? settings.PublicKey : null, [.. devices.Select(ReminderDeviceDto.From)]);
    }
}

/// <summary>
/// Turns reminders on for this device, or changes its time or choice: the browser's push subscription (endpoint and
/// keys), the local time for the day's run, and whether to hear about a new week on Mondays. The same device again
/// updates its entry. A device someone else had reminders on moves to this runner: whoever signs in on it now gets them.
/// </summary>
public sealed record TurnOnRemindersCommand(string Endpoint, string P256dh, string Auth, TimeOnly RemindAt, bool WeekAhead) : IRequest<ReminderDeviceDto>;

internal sealed class TurnOnRemindersValidator : AbstractValidator<TurnOnRemindersCommand>
{
    public TurnOnRemindersValidator(IPushSettings settings)
    {
        RuleFor(c => c.Endpoint)
            .NotEmpty()
            .MaximumLength(PushDevices.MaxEndpointLength)
            .Must(endpoint => Uri.TryCreate(endpoint, UriKind.Absolute, out var uri)
                && uri.Scheme == Uri.UriSchemeHttps
                && uri.IsDefaultPort
                && string.IsNullOrEmpty(uri.UserInfo)
                && settings.Accepts(uri))
            .WithMessage("That isn't a push address from a browser Taperday knows.");
        RuleFor(c => c.P256dh)
            .Must(key => PushDevices.IsBase64UrlOf(key, PushDevices.P256dhBytes) && Base64Url.DecodeFromChars(key)[0] == 0x04)
            .WithMessage("That isn't a browser's push key.");
        RuleFor(c => c.Auth)
            .Must(key => PushDevices.IsBase64UrlOf(key, PushDevices.AuthBytes))
            .WithMessage("That isn't a browser's push secret.");
    }
}

internal sealed class TurnOnRemindersHandler(
    IApplicationDbContext db,
    CurrentRunner current,
    IPushSettings settings,
    IPushAddressProtector protector,
    TimeProvider time)
    : IRequestHandler<TurnOnRemindersCommand, ReminderDeviceDto>
{
    public async Task<ReminderDeviceDto> Handle(TurnOnRemindersCommand request, CancellationToken cancellationToken)
    {
        if (!settings.IsEnabled)
        {
            throw new ConflictException("reminders_unavailable", "Reminders aren't switched on for Taperday yet.");
        }

        var runner = await current.RequireConsentedAsync(cancellationToken);
        var key = PushDevices.KeyOf(request.Endpoint);
        var address = new ProtectedPushAddress(protector.Protect(request.Endpoint), protector.Protect(request.P256dh), protector.Protect(request.Auth));
        var remindAt = new TimeOnly(request.RemindAt.Hour, request.RemindAt.Minute);
        var localNow = time.LocalNow(TimeProviderExtensions.ZoneOf(runner.TimeZone));

        var device = await db.PushSubscriptions.SingleOrDefaultAsync(s => s.DeviceKey == key, cancellationToken);
        if (device is not null && device.RunnerId == runner.Id)
        {
            device.Change(address, remindAt, request.WeekAhead, localNow);
            await db.SaveChangesAsync(cancellationToken);
            return ReminderDeviceDto.From(device);
        }

        if (device is not null)
        {
            // Someone else signed in on this device before. Their reminders here stop; this runner's start.
            db.PushSubscriptions.Remove(device);
            await db.SaveChangesAsync(cancellationToken);
        }

        if (await db.PushSubscriptions.CountAsync(s => s.RunnerId == runner.Id, cancellationToken) >= PushSubscription.MaxPerRunner)
        {
            throw new ConflictException("reminders_limit", $"Reminders can be on for up to {PushSubscription.MaxPerRunner} devices. Turn them off on one you no longer use.");
        }

        device = PushSubscription.Start(runner.Id, key, address, remindAt, request.WeekAhead, localNow);
        db.PushSubscriptions.Add(device);
        await db.SaveChangesAsync(cancellationToken);
        return ReminderDeviceDto.From(device);
    }
}

/// <summary>Turns reminders off for one of the runner's devices and forgets its push address. Safe to repeat.</summary>
public sealed record TurnOffRemindersCommand(Guid Id) : IRequest<bool>;

internal sealed class TurnOffRemindersHandler(IApplicationDbContext db, CurrentRunner current)
    : IRequestHandler<TurnOffRemindersCommand, bool>
{
    public async Task<bool> Handle(TurnOffRemindersCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        var device = runner is null
            ? null
            : await db.PushSubscriptions.SingleOrDefaultAsync(s => s.Id == request.Id && s.RunnerId == runner.Id, cancellationToken);
        if (device is null)
        {
            return false;
        }

        db.PushSubscriptions.Remove(device);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }
}
