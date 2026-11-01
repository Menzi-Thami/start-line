using System.IO.Compression;
using Dynastream.Fit;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Activities;
using StartLine.Domain.Activities;
using DateTime = System.DateTime;
using FitFile = Dynastream.Fit.File;

namespace StartLine.Infrastructure.Activities;

/// <summary>
/// Reads Garmin .FIT activity files with Garmin's FIT SDK, on the server only (its licence doesn't allow handing
/// the SDK to third parties, so it never goes near the client). Accepts the bare .fit or the .zip that Garmin
/// Connect's "Export Original" downloads. Positions are never read: only time, distance, altitude and heart rate.
/// </summary>
internal sealed class FitActivityFileReader
{
    /// <summary>About three days at one sample a second: longer than any race Taperday plans for.</summary>
    public const int MaxSamples = 250_000;

    /// <summary>A .fit inside a zip can be far bigger than the zip; stop unpacking past this.</summary>
    public const int MaxUnzippedBytes = 4 * ActivityUpload.MaxFileBytes;

    private static readonly byte[] ZipSignature = "PK\u0003\u0004"u8.ToArray();

    public static ActivityRecording Read(Stream file)
    {
        ArgumentNullException.ThrowIfNull(file);
        using var fit = IsZip(file) ? Unzip(file) : null;
        var source = fit ?? file;

        var decoder = new Decode();
        source.Position = 0;
        if (!decoder.IsFIT(source))
        {
            throw Unreadable("That isn't a .fit file. In Garmin Connect, open the run, choose Export Original and upload the file it gives you.");
        }

        source.Position = 0;
        if (!decoder.CheckIntegrity(source))
        {
            throw Unreadable("That .fit file is damaged or incomplete. Try exporting it from Garmin Connect again.");
        }

        var collector = new Collector();
        var broadcaster = new MesgBroadcaster();
        decoder.MesgEvent += broadcaster.OnMesg;
        decoder.MesgDefinitionEvent += broadcaster.OnMesgDefinition;
        broadcaster.FileIdMesgEvent += (_, e) => collector.FileType ??= ((FileIdMesg)e.mesg).GetType();
        broadcaster.SessionMesgEvent += (_, e) => collector.Sessions.Add((SessionMesg)e.mesg);
        broadcaster.RecordMesgEvent += (_, e) => collector.Add((RecordMesg)e.mesg);

        source.Position = 0;
        try
        {
            decoder.Read(source);
        }
        catch (FitException)
        {
            throw Unreadable("That .fit file couldn't be read. Try exporting it from Garmin Connect again.");
        }

        if (collector.FileType is not FitFile.Activity || collector.Sessions.Count == 0)
        {
            throw Unreadable("That .fit file isn't a recorded activity. Upload the run itself, not a course or a workout.");
        }

        return collector.ToRecording();
    }

    private static ValidationException Unreadable(string message) =>
        new(new Dictionary<string, string[]>(StringComparer.Ordinal) { ["file"] = [message] });

    private static bool IsZip(Stream file)
    {
        Span<byte> header = stackalloc byte[4];
        file.Position = 0;
        var read = file.ReadAtLeast(header, header.Length, throwOnEndOfStream: false);
        file.Position = 0;
        return read == header.Length && header.SequenceEqual(ZipSignature);
    }

    private static MemoryStream Unzip(Stream zip)
    {
        try
        {
            using var archive = new ZipArchive(zip, ZipArchiveMode.Read, leaveOpen: true);
            var entries = archive.Entries.Where(e => e.FullName.EndsWith(".fit", StringComparison.OrdinalIgnoreCase)).ToList();
            if (entries.Count != 1)
            {
                throw Unreadable("Upload a zip with exactly one .fit file in it, as Garmin Connect's Export Original gives you.");
            }

            // The declared size in a zip can lie, so count what actually comes out.
            using var entry = entries[0].Open();
            var unzipped = new MemoryStream();
            var buffer = new byte[81_920];
            int read;
            while ((read = entry.Read(buffer)) > 0)
            {
                if (unzipped.Length + read > MaxUnzippedBytes)
                {
                    unzipped.Dispose();
                    throw Unreadable("The .fit file in that zip is too big.");
                }

                unzipped.Write(buffer, 0, read);
            }

            return unzipped;
        }
        catch (InvalidDataException)
        {
            throw Unreadable("That zip file is damaged. Try downloading it from Garmin Connect again.");
        }
    }

    private sealed class Collector
    {
        private readonly List<(DateTime At, double Metres, double? Altitude, int? HeartRate)> records = [];

        public FitFile? FileType { get; set; }

        public List<SessionMesg> Sessions { get; } = [];

        public void Add(RecordMesg record)
        {
            if (record.GetDistance() is not { } metres || record.GetTimestamp() is not { } timestamp)
            {
                return;
            }

            if (records.Count >= MaxSamples)
            {
                throw Unreadable("That activity is longer than Taperday can read.");
            }

            var altitude = record.GetEnhancedAltitude() ?? record.GetAltitude();
            records.Add((timestamp.GetDateTime(), metres, altitude, record.GetHeartRate()));
        }

        public ActivityRecording ToRecording()
        {
            if (records.Count == 0)
            {
                throw Unreadable("That activity has no distance recorded, so there's nothing to show.");
            }

            // A multisport file has one session per sport; a run is the running part.
            var session = Sessions.FirstOrDefault(s => s.GetSport() == Sport.Running) ?? Sessions[0];
            var first = records.Min(r => r.At);
            var startedAt = session.GetStartTime() is { } start ? start.GetDateTime() : first;

            return new ActivityRecording(
                new DateTimeOffset(DateTime.SpecifyKind(startedAt, DateTimeKind.Utc)),
                KindOf(session),
                [.. records.Select(r => new ActivitySample(r.At - first, r.Metres, r.Altitude, r.HeartRate))],
                new DeviceTotals(
                    session.GetTotalAscent(),
                    session.GetTotalCalories(),
                    session.GetAvgHeartRate(),
                    session.GetMaxHeartRate()))
            {
                Format = RecordingFormat.Fit,
            };
        }

        private static ActivityKind KindOf(SessionMesg session) => (session.GetSport(), session.GetSubSport()) switch
        {
            (Sport.Running, SubSport.Trail) => ActivityKind.TrailRun,
            (Sport.Running, SubSport.Treadmill or SubSport.IndoorRunning) => ActivityKind.TreadmillRun,
            (Sport.Running, _) => ActivityKind.Run,
            _ => ActivityKind.Other,
        };
    }
}
