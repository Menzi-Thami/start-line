using StartLine.Domain.Common;

namespace StartLine.Domain.Runners;

/// <summary>
/// The runner's own picture, only if they chose to add one; without it the app shows their initials. Kept apart from
/// <see cref="Runner"/> so the bytes are only read when the picture is asked for, and it goes with the runner. Small by
/// design: the app shrinks it to a square a few hundred pixels across before it's sent.
/// </summary>
public sealed class RunnerPhoto
{
    /// <summary>Far more than a 256-pixel square needs, and small enough that a picture never weighs on a page.</summary>
    public const int MaxBytes = 96 * 1024;

    private static readonly string[] Types = ["image/jpeg", "image/png", "image/webp"];

    private RunnerPhoto()
    {
    }

    public Guid RunnerId { get; private set; }

    public string ContentType { get; private set; } = "";

    public byte[] Data { get; private set; } = [];

    public static RunnerPhoto For(Guid runnerId, string contentType, byte[] data)
    {
        if (runnerId == Guid.Empty)
        {
            throw new DomainException("A picture belongs to a runner.");
        }

        var photo = new RunnerPhoto { RunnerId = runnerId };
        photo.Replace(contentType, data);
        return photo;
    }

    /// <summary>A new picture in place of the old. Only a real JPEG, PNG or WebP of the type it says it is.</summary>
    public void Replace(string contentType, byte[] data)
    {
        ArgumentNullException.ThrowIfNull(data);
        if (!Types.Contains(contentType))
        {
            throw new DomainException("A picture must be a JPEG, PNG or WebP image.");
        }

        if (data.Length == 0 || data.Length > MaxBytes)
        {
            throw new DomainException($"A picture must be under {MaxBytes / 1024} KB.");
        }

        if (!Looks(contentType, data))
        {
            throw new DomainException("That file isn't the image it says it is.");
        }

        ContentType = contentType;
        Data = data;
    }

    /// <summary>The file's own first bytes agree with its type, so nothing else can pass as a picture.</summary>
    private static bool Looks(string contentType, byte[] data) => contentType switch
    {
        "image/jpeg" => data is [0xFF, 0xD8, 0xFF, ..],
        "image/png" => data is [0x89, 0x50, 0x4E, 0x47, ..],
        "image/webp" => data.Length > 12 && data.AsSpan(0, 4).SequenceEqual("RIFF"u8) && data.AsSpan(8, 4).SequenceEqual("WEBP"u8),
        _ => false,
    };
}
