using System.Buffers.Text;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.Calendar;

/// <summary>The secret in the runner's personal calendar link. The client builds the links from it.</summary>
public sealed record CalendarLinkDto(string Token);

/// <summary>What the personal feed shows: the runner's current plan as the app has it (none means an empty calendar), in their units.</summary>
public sealed record CalendarFeedDto(TrainingPlanDto? Plan, Units Units);

internal static class CalendarTokens
{
    /// <summary>32 random bytes, base64url: 43 characters that are safe in a URL path and can't be guessed.</summary>
    public static string New() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
}

/// <summary>
/// The runner's personal calendar link, made the first time it's asked for. Unlike a plan's own link it never goes out
/// of date: it always shows whatever plan is current, with the coach's calls and any replan.
/// </summary>
public sealed record GetMyCalendarLinkQuery : IRequest<CalendarLinkDto>;

internal sealed class GetMyCalendarLinkHandler(IApplicationDbContext db, CurrentRunner current)
    : IRequestHandler<GetMyCalendarLinkQuery, CalendarLinkDto>
{
    public async Task<CalendarLinkDto> Handle(GetMyCalendarLinkQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireAsync(cancellationToken);
        if (runner.CalendarToken is { } existing)
        {
            return new CalendarLinkDto(existing);
        }

        runner.IssueCalendarToken(CalendarTokens.New());
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return new CalendarLinkDto(runner.CalendarToken!);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Asked for twice at once (two tabs, a double tap): the other request issued the link first, and it stands.
            db.Runners.Entry(runner).State = EntityState.Detached;
            var saved = await current.RequireAsync(cancellationToken);
            return new CalendarLinkDto(saved.CalendarToken ?? throw new InvalidOperationException("The calendar link was cleared while it was being issued."));
        }
    }
}

/// <summary>A new calendar link. The old one stops working at once, for anyone who has it.</summary>
public sealed record ResetMyCalendarLinkCommand : IRequest<CalendarLinkDto>;

internal sealed class ResetMyCalendarLinkHandler(IApplicationDbContext db, CurrentRunner current)
    : IRequestHandler<ResetMyCalendarLinkCommand, CalendarLinkDto>
{
    public async Task<CalendarLinkDto> Handle(ResetMyCalendarLinkCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireAsync(cancellationToken);
        runner.ResetCalendarToken(CalendarTokens.New());
        await db.SaveChangesAsync(cancellationToken);
        return new CalendarLinkDto(runner.CalendarToken!);
    }
}

/// <summary>
/// The personal feed, for calendar apps, which can't sign in: the secret is the only key. The plan is built exactly as
/// opening it in the app would (<see cref="PlanCoach"/>, as reminders do), so the calendar and the app always agree.
/// </summary>
public sealed record GetCalendarFeedQuery(string Token) : IRequest<CalendarFeedDto>;

internal sealed class GetCalendarFeedHandler(IApplicationDbContext db, PlanBuilder builder, PlanCoach coach)
    : IRequestHandler<GetCalendarFeedQuery, CalendarFeedDto>
{
    public async Task<CalendarFeedDto> Handle(GetCalendarFeedQuery request, CancellationToken cancellationToken)
    {
        var token = request.Token;
        var runner = token is { Length: >= Runner.MinCalendarTokenLength and <= Runner.MaxCalendarTokenLength }
            ? await db.Runners.AsNoTracking().SingleOrDefaultAsync(r => r.CalendarToken == token, cancellationToken)
            : null;

        // Never the secret itself in the error: it would end up in responses and anything that records them.
        if (runner is null)
        {
            throw new NotFoundException("Calendar", "link");
        }

        var saved = await db.SavedPlans.AsNoTracking()
            .SingleOrDefaultAsync(p => p.RunnerId == runner.Id && p.Status == SavedPlanStatus.Active, cancellationToken);
        if (saved is null)
        {
            return new CalendarFeedDto(null, runner.Units);
        }

        var calls = await coach.CallsAsync(saved, runner, cancellationToken);
        return new CalendarFeedDto(builder.Build(SavedPlanMapping.ToQuery(saved.Inputs), calls), runner.Units);
    }
}
