using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using StartLine.Application.Common.Exceptions;
using StartLine.Domain.Common;

namespace StartLine.API.Infrastructure;

/// <summary>The one place typed exceptions become RFC 9457 responses. Endpoints never catch.</summary>
internal sealed partial class ProblemDetailsExceptionHandler(
    IProblemDetailsService problemDetails,
    ILogger<ProblemDetailsExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var (status, code, title, detail) = exception switch
        {
            ValidationException => (StatusCodes.Status400BadRequest, "validation_failed", "One or more fields are invalid.", (string?)null),
            DomainException e => (StatusCodes.Status400BadRequest, "invalid_request", "The request can't be processed.", e.Message),
            NotFoundException e => (StatusCodes.Status404NotFound, "not_found", "Not found.", e.Message),
            BadHttpRequestException => (StatusCodes.Status400BadRequest, "bad_request", "The request is malformed.", null),
            _ => (StatusCodes.Status500InternalServerError, "server_error", "Something went wrong on our side.", null),
        };

        if (status >= StatusCodes.Status500InternalServerError)
        {
            LogUnhandled(logger, exception);
        }

        var problem = exception is ValidationException validation
            ? new ValidationProblemDetails(validation.Errors.ToDictionary(e => e.Key, e => e.Value, StringComparer.Ordinal))
            : new ProblemDetails();
        problem.Status = status;
        problem.Title = title;
        problem.Detail = detail;
        problem.Extensions["code"] = code;

        httpContext.Response.StatusCode = status;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Unhandled exception")]
    private static partial void LogUnhandled(ILogger logger, Exception exception);
}
