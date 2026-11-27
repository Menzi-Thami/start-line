namespace StartLine.API.Infrastructure;

internal sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext context)
    {
        var headers = context.Response.Headers;
        headers.XContentTypeOptions = "nosniff";
        headers["Referrer-Policy"] = "no-referrer";
        headers["X-Frame-Options"] = "DENY";
        headers.ContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'";
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        if (context.Request.Path.Value?.Split('/', StringSplitOptions.RemoveEmptyEntries) is ["api", _, "me", ..])
        {
            headers.CacheControl = "no-store";
            headers.Pragma = "no-cache";
        }
        return next(context);
    }
}
