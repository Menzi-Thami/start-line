using System.Diagnostics;

namespace StartLine.API.Infrastructure;

/// <summary>Puts the trace id on every response, so a user's report can be matched to its logs and spans.</summary>
internal sealed class TraceIdMiddleware(RequestDelegate next)
{
    public const string Header = "X-Trace-Id";

    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[Header] = Activity.Current?.TraceId.ToString() ?? context.TraceIdentifier;
            return Task.CompletedTask;
        });
        return next(context);
    }
}
