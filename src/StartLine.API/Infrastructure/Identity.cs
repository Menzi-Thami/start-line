using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using Microsoft.Identity.Web;
using StartLine.Application.Common;

namespace StartLine.API.Infrastructure;

/// <summary>The only place that reads the HTTP user. Everything else depends on ICurrentUser.</summary>
internal sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User is { Identity.IsAuthenticated: true } user ? user : null;

    // External ID puts the stable user id in `oid`; `sub` is per-app and a fallback only.
    public string? Subject => Principal?.GetObjectId() ?? Principal?.FindFirstValue("sub");

    public string? Email => Principal?.FindFirstValue("email") ?? Principal?.FindFirstValue(ClaimTypes.Email);
}

/// <summary>
/// Used when no External ID app registration is configured: nobody can sign in, so protected endpoints
/// answer 401, and the anonymous plan builder carries on as before.
/// </summary>
internal sealed class AccountsDisabledHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "AccountsDisabled";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync() => Task.FromResult(AuthenticateResult.NoResult());
}
