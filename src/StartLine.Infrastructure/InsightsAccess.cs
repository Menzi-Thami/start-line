using Microsoft.Extensions.Configuration;
using StartLine.Application.Features.Insights;

namespace StartLine.Infrastructure;

/// <summary>Insights:AdminEmails, a comma- or semicolon-separated list. Empty means nobody, so the page is shut by default.</summary>
internal sealed class ConfiguredInsightsAccess(IConfiguration configuration) : IInsightsAccess
{
    private readonly HashSet<string> admins = new(
        (configuration["Insights:AdminEmails"] ?? "").Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
        StringComparer.OrdinalIgnoreCase);

    public bool IsAdmin(string? email) => email is not null && admins.Contains(email);
}
