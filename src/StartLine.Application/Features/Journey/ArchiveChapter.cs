using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Races;

namespace StartLine.Application.Features.Journey;

public sealed record ArchiveChapterRequest(string ExpectedVersion);
public sealed record ArchiveChapterCommand(Guid PlanId, ArchiveChapterRequest Archive) : IRequest<bool>;

internal sealed class ArchiveChapterHandler(IApplicationDbContext db, CurrentRunner current, IRaceCatalogue catalogue)
    : IRequestHandler<ArchiveChapterCommand, bool>
{
    public async Task<bool> Handle(ArchiveChapterCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var plan = await OwnJourney.PlanAsync(db, runner, request.PlanId, cancellationToken, tracked: true);
        if (plan.Status == Domain.Plans.SavedPlanStatus.Archived) return true;
        if (string.IsNullOrEmpty(request.Archive.ExpectedVersion) || !JourneyVersion.Matches(request.Archive.ExpectedVersion, plan.Version))
            throw new ConflictException("plan_changed", "Your plan changed. Load the chapter again before archiving it.");
        SavedPlanMapping.FreezeRace(plan, catalogue);
        plan.Archive();
        try { await db.SaveChangesAsync(cancellationToken); }
        catch (DbUpdateConcurrencyException) { throw new ConflictException("plan_changed", "Your plan changed. Load it again before archiving it."); }
        // Archiving never completes a run, assumes a race finish, or ends recovery.
        return true;
    }
}
