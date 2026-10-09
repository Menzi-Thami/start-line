using Microsoft.Extensions.Diagnostics.HealthChecks;
using StartLine.Application.Features.Races;

namespace StartLine.API.Infrastructure;

/// <summary>Ready means the catalogue loaded. An empty catalogue still serves custom races, so it degrades rather than fails.</summary>
internal sealed class RaceCatalogueHealthCheck(IRaceCatalogue catalogue) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default) =>
        Task.FromResult(catalogue.All().Count > 0
            ? HealthCheckResult.Healthy()
            : HealthCheckResult.Degraded("The race catalogue is empty; only custom races are available."));
}
