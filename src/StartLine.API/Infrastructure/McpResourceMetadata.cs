namespace StartLine.API.Infrastructure;

/// <summary>
/// OAuth 2.0 protected-resource metadata for the MCP endpoint (RFC 9728), so an MCP client that gets a 401 can find where to
/// sign in: Taperday's Entra External ID tenant, and the scope the runner tools need. Public by design: it names no runner.
/// Discovery alone doesn't connect a third-party assistant: Entra External ID has no dynamic client registration, so a client
/// needs its own registration in the tenant (docs/ai-coach-mcp.md).
/// </summary>
internal static class McpResourceMetadata
{
    public const string Path = "/.well-known/oauth-protected-resource/mcp";

    public static string MetadataUri(HttpRequest request) => $"{request.Scheme}://{request.Host}{Path}";

    public static object For(HttpRequest request, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(configuration);
        var instance = configuration["AzureAd:Instance"]?.TrimEnd('/');
        var tenant = configuration["AzureAd:TenantId"];
        var clientId = configuration["AzureAd:ClientId"];
        var scope = configuration["AzureAd:Scope"] ?? PresentationDependencyInjection.DefaultScope;
        return new
        {
            resource = $"{request.Scheme}://{request.Host}/mcp",
            authorization_servers = instance is null || tenant is null ? Array.Empty<string>() : [$"{instance}/{tenant}/v2.0"],
            scopes_supported = clientId is null ? new[] { scope } : [$"api://{clientId}/{scope}"],
            bearer_methods_supported = new[] { "header" },
            resource_name = "Taperday",
        };
    }
}
