using FluentValidation;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Domain.Common;
using ValidationException = StartLine.Application.Common.Exceptions.ValidationException;

namespace StartLine.Application.Features.Activities;

public static class BulkUpload
{
    /// <summary>A batch is small enough to read in one request on the smallest App Service plan.</summary>
    public const int MaxFilesPerBatch = 20;

    /// <summary>Twenty long runs fit comfortably; the client sends fewer files when they're big.</summary>
    public const int MaxBatchBytes = 25 * 1024 * 1024;

    /// <summary>The files plus the multipart envelope around them.</summary>
    public const int MaxRequestBytes = MaxBatchBytes + (256 * 1024);

    public const int MaxFileNameLength = 255;
}

public enum ImportStatus
{
    Imported,
    AlreadyUploaded,

    /// <summary>Read fine, but not something Taperday keeps: a ride, a walk, a watch started by accident.</summary>
    Skipped,
    Unreadable,

    /// <summary>The runner has reached <see cref="Domain.Activities.Activity.MaxPerRunner"/>; nothing more was read.</summary>
    LimitReached,
}

public sealed record ActivityFile(string Name, Stream Content);

/// <summary>What happened to each file, in the order sent. Never fails as a whole for one bad file.</summary>
public sealed record BulkImportDto(IReadOnlyList<BulkImportFileDto> Files);

public sealed record BulkImportFileDto(string Name, ImportStatus Status, string? Message, ActivitySummaryDto? Activity);

/// <summary>Imports many runs at once: a batch of .fit files, such as the ones a Garmin account export holds.</summary>
public sealed record ImportActivitiesCommand(IReadOnlyList<ActivityFile> Files) : IRequest<BulkImportDto>;

internal sealed class ImportActivitiesValidator : AbstractValidator<ImportActivitiesCommand>
{
    public ImportActivitiesValidator()
    {
        RuleFor(c => c.Files)
            .NotEmpty().WithMessage("Choose at least one run file to upload.")
            .Must(f => f.Count <= BulkUpload.MaxFilesPerBatch).WithMessage($"Send at most {BulkUpload.MaxFilesPerBatch} files at a time.")
            .Must(f => f.Sum(file => file.Content.CanSeek ? file.Content.Length : 0) <= BulkUpload.MaxBatchBytes)
            .WithMessage($"Send at most {BulkUpload.MaxBatchBytes / 1024 / 1024} MB at a time.")
            .OverridePropertyName("files");
        RuleForEach(c => c.Files).ChildRules(file =>
        {
            file.RuleFor(f => f.Name).NotEmpty().MaximumLength(BulkUpload.MaxFileNameLength);
            file.RuleFor(f => f.Content)
                .Must(s => s is { CanRead: true, CanSeek: true, Length: > 0 }).WithMessage("That file is empty.")
                .Must(s => s is { CanSeek: true } && s.Length <= ActivityUpload.MaxFileBytes)
                .WithMessage($"That file is too big. Activity files are up to {ActivityUpload.MaxFileBytes / 1024 / 1024} MB.");
        }).OverridePropertyName("files");
    }
}

internal sealed class ImportActivitiesHandler(CurrentRunner current, ActivityImporter importer)
    : IRequestHandler<ImportActivitiesCommand, BulkImportDto>
{
    public async Task<BulkImportDto> Handle(ImportActivitiesCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        List<BulkImportFileDto> results = [];
        var full = false;
        foreach (var file in request.Files)
        {
            if (full)
            {
                results.Add(new(file.Name, ImportStatus.LimitReached, null, null));
                continue;
            }

            // Each file stands alone: one that can't be read, or isn't a run, is reported and the batch carries on.
            // Only these expected outcomes are turned into results; anything else is a real failure and propagates.
            try
            {
                var activity = await importer.ImportAsync(runner, file.Content, cancellationToken, file.Name);
                results.Add(new(file.Name, ImportStatus.Imported, null, ActivitySummaryDto.From(activity)));
            }
            catch (ValidationException e)
            {
                results.Add(new(file.Name, ImportStatus.Unreadable, e.Errors.Values.SelectMany(m => m).FirstOrDefault(), null));
            }
            catch (DomainException e)
            {
                results.Add(new(file.Name, ImportStatus.Skipped, e.Message, null));
            }
            catch (ConflictException e) when (e.Code == ActivityImporter.DuplicateCode)
            {
                results.Add(new(file.Name, ImportStatus.AlreadyUploaded, null, null));
            }
            catch (ConflictException e) when (e.Code == ActivityImporter.LimitCode)
            {
                full = true;
                results.Add(new(file.Name, ImportStatus.LimitReached, e.Message, null));
            }
        }

        return new BulkImportDto(results);
    }
}
