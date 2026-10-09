using Microsoft.EntityFrameworkCore;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Application.Common;

/// <summary>The signed-in caller, from the validated token only. Never from the request body.</summary>
public interface ICurrentUser
{
    /// <summary>The identity provider's stable id for the user, or null when anonymous.</summary>
    string? Subject { get; }

    string? Email { get; }
}

public interface IApplicationDbContext
{
    DbSet<Runner> Runners { get; }

    DbSet<SavedPlan> SavedPlans { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
