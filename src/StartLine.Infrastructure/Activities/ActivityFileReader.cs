using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Activities;
using StartLine.Domain.Activities;

namespace StartLine.Infrastructure.Activities;

/// <summary>
/// Reads whatever activity file a runner uploads, by looking at what's actually in it rather than its name: a Garmin
/// .FIT (or the .zip around it), or the GPX and TCX that Strava, Apple Health apps, COROS, Suunto, Polar and Wahoo
/// export. Positions are never kept, whichever format it is.
/// </summary>
internal sealed class ActivityFileReader : IActivityFileReader
{
    public ActivityRecording Read(Stream file)
    {
        ArgumentNullException.ThrowIfNull(file);
        if (!file.CanSeek)
        {
            throw new ValidationException(new Dictionary<string, string[]>(StringComparer.Ordinal) { ["file"] = ["That file couldn't be read."] });
        }

        return XmlActivityFileReader.LooksLikeXml(file) ? XmlActivityFileReader.Read(file) : FitActivityFileReader.Read(file);
    }
}
