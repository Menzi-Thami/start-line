using System.IO.Compression;
using Dynastream.Fit;
using DateTime = System.DateTime;
using FitDateTime = Dynastream.Fit.DateTime;
using FitFile = Dynastream.Fit.File;

namespace StartLine.Integration.Tests;

/// <summary>Writes real .fit activity files with Garmin's SDK, as a watch would, so tests need no binary fixtures.</summary>
internal static class FitFiles
{
    /// <summary>A steady run sampled every second, with heart rate and a gentle climb.</summary>
    public static byte[] Run(DateTime startUtc, double metres, double secondsPerKm, Sport sport = Sport.Running, SubSport subSport = SubSport.Generic)
    {
        using var stream = new MemoryStream();
        var encoder = new Encode(ProtocolVersion.V20);
        encoder.Open(stream);

        var fileId = new FileIdMesg();
        fileId.SetType(FitFile.Activity);
        fileId.SetManufacturer(Manufacturer.Development);
        fileId.SetProduct(1);
        fileId.SetSerialNumber(1234);
        fileId.SetTimeCreated(new FitDateTime(startUtc));
        encoder.Write(fileId);

        var seconds = (int)Math.Round(metres / 1000 * secondsPerKm);
        for (var s = 0; s <= seconds; s++)
        {
            var record = new RecordMesg();
            record.SetTimestamp(new FitDateTime(startUtc.AddSeconds(s)));
            record.SetDistance((float)(metres * s / seconds));
            record.SetEnhancedAltitude((float)(50 + (20.0 * s / seconds)));
            record.SetHeartRate((byte)(140 + (20 * s / seconds)));
            encoder.Write(record);
        }

        var session = new SessionMesg();
        session.SetTimestamp(new FitDateTime(startUtc.AddSeconds(seconds)));
        session.SetStartTime(new FitDateTime(startUtc));
        session.SetSport(sport);
        session.SetSubSport(subSport);
        session.SetTotalElapsedTime(seconds);
        session.SetTotalTimerTime(seconds);
        session.SetTotalDistance((float)metres);
        session.SetTotalAscent(20);
        session.SetTotalCalories((ushort)(metres / 1000 * 70));
        session.SetAvgHeartRate(150);
        session.SetMaxHeartRate(160);
        encoder.Write(session);

        encoder.Close();
        return stream.ToArray();
    }

    /// <summary>What Garmin Connect's "Export Original" downloads: the .fit inside a zip.</summary>
    public static byte[] Zipped(byte[] fit, string name = "21456789012_ACTIVITY.fit")
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            using var entry = archive.CreateEntry(name).Open();
            entry.Write(fit);
        }

        return stream.ToArray();
    }
}
