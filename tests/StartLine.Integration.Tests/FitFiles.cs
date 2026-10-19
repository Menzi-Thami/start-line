using System.IO.Compression;
using Dynastream.Fit;
using DateTime = System.DateTime;
using FitDateTime = Dynastream.Fit.DateTime;
using FitFile = Dynastream.Fit.File;

namespace StartLine.Integration.Tests;

/// <summary>A stretch of a run at one steady pace, climbing (or dropping) evenly, at one heart rate.</summary>
internal sealed record Stretch(double Metres, double SecondsPerKm, double ClimbMetres = 0, byte HeartRate = 150);

/// <summary>Writes real .fit activity files with Garmin's SDK, as a watch would, so tests need no binary fixtures.</summary>
internal static class FitFiles
{
    /// <summary>A steady run sampled every second.</summary>
    public static byte[] Run(DateTime startUtc, double metres, double secondsPerKm, Sport sport = Sport.Running, SubSport subSport = SubSport.Generic) =>
        Run(startUtc, [new Stretch(metres, secondsPerKm, ClimbMetres: 20)], sport, subSport);

    /// <summary>A run made of stretches, sampled every second, with the watch's own totals in the session.</summary>
    public static byte[] Run(DateTime startUtc, IReadOnlyList<Stretch> stretches, Sport sport = Sport.Running, SubSport subSport = SubSport.Generic)
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

        var (elapsed, metres, altitude, ascent) = (0, 0d, 50d, 0d);
        List<byte> heartRates = [];
        Write(stretches[0].HeartRate);
        foreach (var stretch in stretches)
        {
            var seconds = (int)Math.Round(stretch.Metres / 1000 * stretch.SecondsPerKm);
            for (var s = 1; s <= seconds; s++)
            {
                elapsed++;
                metres += stretch.Metres / seconds;
                altitude += stretch.ClimbMetres / seconds;
                ascent += Math.Max(0, stretch.ClimbMetres / seconds);
                Write(stretch.HeartRate);
            }
        }

        var session = new SessionMesg();
        session.SetTimestamp(new FitDateTime(startUtc.AddSeconds(elapsed)));
        session.SetStartTime(new FitDateTime(startUtc));
        session.SetSport(sport);
        session.SetSubSport(subSport);
        session.SetTotalElapsedTime(elapsed);
        session.SetTotalTimerTime(elapsed);
        session.SetTotalDistance((float)metres);
        session.SetTotalAscent((ushort)Math.Round(ascent));
        session.SetTotalCalories((ushort)(metres / 1000 * 70));
        session.SetAvgHeartRate((byte)Math.Round(heartRates.Average(h => h)));
        session.SetMaxHeartRate(heartRates.Max());
        encoder.Write(session);

        encoder.Close();
        return stream.ToArray();

        void Write(byte heartRate)
        {
            var record = new RecordMesg();
            record.SetTimestamp(new FitDateTime(startUtc.AddSeconds(elapsed)));
            record.SetDistance((float)metres);
            record.SetEnhancedAltitude((float)altitude);
            record.SetHeartRate(heartRate);
            encoder.Write(record);
            heartRates.Add(heartRate);
        }
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
