using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Domain.Runners;
using ValidationException = StartLine.Application.Common.Exceptions.ValidationException;

namespace StartLine.Application.Features.Account;

/// <summary>Transport headroom for the existing 96 KB image cap, base64 and JSON encoding.</summary>
public static class PhotoUpload
{
    public const int MaxRequestBytes = 192 * 1024;
}

/// <summary>The runner's picture as a data URL (<c>data:image/jpeg;base64,…</c>), ready for an img's src.</summary>
public sealed record RunnerPhotoDto(string DataUrl)
{
    public static RunnerPhotoDto From(RunnerPhoto photo) => new($"data:{photo.ContentType};base64,{Convert.ToBase64String(photo.Data)}");
}

/// <summary>The runner's picture, or null when they haven't added one (the app shows their initials).</summary>
public sealed record GetMyPhotoQuery : IRequest<RunnerPhotoDto?>;

internal sealed class GetMyPhotoHandler(IApplicationDbContext db, CurrentRunner current) : IRequestHandler<GetMyPhotoQuery, RunnerPhotoDto?>
{
    public async Task<RunnerPhotoDto?> Handle(GetMyPhotoQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireAsync(cancellationToken);
        var photo = await db.RunnerPhotos.AsNoTracking().SingleOrDefaultAsync(p => p.RunnerId == runner.Id, cancellationToken);
        return photo is null ? null : RunnerPhotoDto.From(photo);
    }
}

/// <summary>Adds or replaces the runner's picture, sent as a data URL.</summary>
public sealed record SetMyPhotoCommand(string DataUrl) : IRequest<RunnerPhotoDto>;

internal sealed class SetMyPhotoValidator : AbstractValidator<SetMyPhotoCommand>
{
    /// <summary>A data URL's base64 is a third longer than the bytes, plus its short prefix.</summary>
    public const int MaxLength = (RunnerPhoto.MaxBytes * 4 / 3) + 64;

    public SetMyPhotoValidator()
    {
        RuleFor(c => c.DataUrl).NotEmpty().MaximumLength(MaxLength).Must(u => u.StartsWith("data:image/", StringComparison.Ordinal))
            .WithMessage("Send the picture as an image data URL.");
    }
}

internal sealed class SetMyPhotoHandler(IApplicationDbContext db, CurrentRunner current) : IRequestHandler<SetMyPhotoCommand, RunnerPhotoDto>
{
    public async Task<RunnerPhotoDto> Handle(SetMyPhotoCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireAsync(cancellationToken);
        var (contentType, data) = Parse(request.DataUrl);
        var photo = await db.RunnerPhotos.SingleOrDefaultAsync(p => p.RunnerId == runner.Id, cancellationToken);
        if (photo is null)
        {
            photo = RunnerPhoto.For(runner.Id, contentType, data);
            db.RunnerPhotos.Add(photo);
        }
        else
        {
            photo.Replace(contentType, data);
        }

        await db.SaveChangesAsync(cancellationToken);
        return RunnerPhotoDto.From(photo);
    }

    private static (string ContentType, byte[] Data) Parse(string dataUrl)
    {
        const string Marker = ";base64,";
        var comma = dataUrl.IndexOf(Marker, StringComparison.Ordinal);
        if (comma < "data:".Length)
        {
            throw Invalid();
        }

        try
        {
            return (dataUrl["data:".Length..comma], Convert.FromBase64String(dataUrl[(comma + Marker.Length)..]));
        }
        catch (FormatException)
        {
            throw Invalid();
        }
    }

    private static ValidationException Invalid() =>
        new(new Dictionary<string, string[]> { ["dataUrl"] = ["That picture couldn't be read. Try another."] });
}

/// <summary>Removes the runner's picture; the app goes back to their initials. Safe to repeat.</summary>
public sealed record DeleteMyPhotoCommand : IRequest<bool>;

internal sealed class DeleteMyPhotoHandler(IApplicationDbContext db, CurrentRunner current) : IRequestHandler<DeleteMyPhotoCommand, bool>
{
    public async Task<bool> Handle(DeleteMyPhotoCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireAsync(cancellationToken);
        var photo = await db.RunnerPhotos.SingleOrDefaultAsync(p => p.RunnerId == runner.Id, cancellationToken);
        if (photo is not null)
        {
            db.RunnerPhotos.Remove(photo);
            await db.SaveChangesAsync(cancellationToken);
        }

        return true;
    }
}
