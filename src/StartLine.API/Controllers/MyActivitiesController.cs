using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Activities;

namespace StartLine.API.Controllers;

[ApiController]
[Authorize(Policy = PresentationDependencyInjection.RunnerPolicy)]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/me/activities")]
public sealed class MyActivitiesController(IDispatcher dispatcher) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<ActivitySummaryDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new ListMyActivitiesQuery(), cancellationToken));

    /// <summary>
    /// Uploads one run: a Garmin .fit file, or the .zip from Garmin Connect's "Export Original". The file is read and
    /// thrown away; only the summary is kept. 409 if it's already uploaded or the runner has reached the limit.
    /// </summary>
    [HttpPost]
    [EnableRateLimiting(PresentationDependencyInjection.UploadRateLimitPolicy)]
    // The app caps request bodies at 16 KB; this is the one endpoint that takes a file.
    [RequestSizeLimit(ActivityUpload.MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = ActivityUpload.MaxRequestBytes)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType<ActivityDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Upload(IFormFile? file, CancellationToken cancellationToken)
    {
        // Copied to memory (at most the size limit above) because the FIT decoder seeks back and forth.
        await using var content = new MemoryStream();
        if (file is not null)
        {
            await file.CopyToAsync(content, cancellationToken);
        }

        var activity = await dispatcher.Send(new ImportActivityCommand(content, file?.FileName), cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = activity.Id, version = "1" }, activity);
    }

    /// <summary>
    /// Uploads up to <see cref="BulkUpload.MaxFilesPerBatch"/> .fit files at once, such as the ones in a Garmin account export (the
    /// browser unzips the export and sends the .fit files in batches). Every file gets its own result; a bad file never
    /// fails the batch.
    /// </summary>
    [HttpPost("batch")]
    [EnableRateLimiting(PresentationDependencyInjection.BulkUploadRateLimitPolicy)]
    [RequestSizeLimit(BulkUpload.MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = BulkUpload.MaxRequestBytes)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType<BulkImportDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UploadBatch(IFormFileCollection files, CancellationToken cancellationToken)
    {
        List<ActivityFile> contents = [];
        try
        {
            foreach (var file in files.Take(BulkUpload.MaxFilesPerBatch + 1))
            {
                var content = new MemoryStream();
                contents.Add(new ActivityFile(Path.GetFileName(file.FileName), content));
                await file.CopyToAsync(content, cancellationToken);
                content.Position = 0;
            }

            return Ok(await dispatcher.Send(new ImportActivitiesCommand(contents), cancellationToken));
        }
        finally
        {
            foreach (var file in contents)
            {
                await file.Content.DisposeAsync();
            }
        }
    }

    /// <summary>The runner's fastest time at each standard distance, across uploaded and synced runs.</summary>
    [HttpGet("bests")]
    [ProducesResponseType<IReadOnlyList<PersonalBestDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Bests(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new ListMyBestsQuery(), cancellationToken));

    [HttpGet("{id:guid}")]
    [ProducesResponseType<ActivityDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new GetMyActivityQuery(id), cancellationToken));

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await dispatcher.Send(new DeleteMyActivityCommand(id), cancellationToken);
        return NoContent();
    }
}
