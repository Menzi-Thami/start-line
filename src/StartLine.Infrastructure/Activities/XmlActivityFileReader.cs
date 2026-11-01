using System.Globalization;
using System.Xml;
using StartLine.Application.Common.Exceptions;
using StartLine.Domain.Activities;

namespace StartLine.Infrastructure.Activities;

/// <summary>
/// Reads the two XML activity formats most apps can export: GPX (Strava, Apple Health apps, COROS, Suunto, Polar) and
/// TCX (Garmin, Polar, Wahoo). GPX has no distance of its own, so distance is worked out from the track's positions as
/// it's read; the positions themselves are never kept, so nothing stored says where anyone ran.
/// </summary>
internal sealed class XmlActivityFileReader
{
    /// <summary>XML is wordy: a 100 km ultra at one point a second is about 30 MB of GPX.</summary>
    public const long MaxCharacters = 64L * 1024 * 1024;

    private const double EarthRadiusMetres = 6_371_008.8;

    private static readonly XmlReaderSettings Settings = new()
    {
        // No DTDs, no external entities, no network: a file is data, never instructions to fetch more.
        DtdProcessing = DtdProcessing.Prohibit,
        XmlResolver = null,
        MaxCharactersInDocument = MaxCharacters,
        MaxCharactersFromEntities = 0,
        IgnoreComments = true,
        IgnoreProcessingInstructions = true,
        IgnoreWhitespace = true,
    };

    /// <summary>True when the stream looks like XML (after any byte-order mark and whitespace).</summary>
    public static bool LooksLikeXml(Stream file)
    {
        ArgumentNullException.ThrowIfNull(file);
        Span<byte> head = stackalloc byte[64];
        file.Position = 0;
        var read = file.ReadAtLeast(head, head.Length, throwOnEndOfStream: false);
        file.Position = 0;
        var text = head[..read];
        if (text.StartsWith("﻿"u8))
        {
            text = text[3..];
        }

        foreach (var b in text)
        {
            if (b is (byte)' ' or (byte)'\t' or (byte)'\r' or (byte)'\n')
            {
                continue;
            }

            return b == (byte)'<';
        }

        return false;
    }

    public static ActivityRecording Read(Stream file)
    {
        ArgumentNullException.ThrowIfNull(file);
        file.Position = 0;
        try
        {
            using var reader = XmlReader.Create(file, Settings);
            reader.MoveToContent();
            return reader.LocalName switch
            {
                "gpx" => ReadGpx(reader),
                "TrainingCenterDatabase" => ReadTcx(reader),
                _ => throw Unreadable("That file isn't a .gpx or .tcx activity."),
            };
        }
        catch (XmlException)
        {
            throw Unreadable("That file couldn't be read. Try exporting it again.");
        }
    }

    private static ActivityRecording ReadGpx(XmlReader reader)
    {
        var track = new TrackBuilder();
        string? type = null;
        double? lat = null, lon = null, ele = null;
        DateTimeOffset? time = null;
        int? hr = null;

        // Reading an element's text moves past it, so those cases continue without another Read.
        reader.Read();
        while (!reader.EOF)
        {
            if (reader.NodeType == XmlNodeType.Element)
            {
                switch (reader.LocalName)
                {
                    case "trkpt":
                        lat = Number(reader.GetAttribute("lat"));
                        lon = Number(reader.GetAttribute("lon"));
                        ele = null;
                        time = null;
                        hr = null;
                        if (reader.IsEmptyElement)
                        {
                            track.AddPosition(time, lat, lon, ele, hr);
                        }

                        break;
                    case "ele" when lat is not null:
                        ele = Number(reader.ReadElementContentAsString());
                        continue;
                    case "time" when lat is not null:
                        time = Time(reader.ReadElementContentAsString());
                        continue;
                    case "hr" or "heartrate" when lat is not null:
                        hr = (int?)Number(reader.ReadElementContentAsString());
                        continue;
                    case "type" when lat is null && type is null:
                        type = reader.ReadElementContentAsString().Trim();
                        continue;
                }
            }
            else if (reader.NodeType == XmlNodeType.EndElement && reader.LocalName == "trkpt")
            {
                track.AddPosition(time, lat, lon, ele, hr);
                lat = null;
                lon = null;
            }

            reader.Read();
        }

        return track.ToRecording(GpxKind(type), DeviceTotals.None) with { Format = RecordingFormat.Gpx };
    }

    private static ActivityRecording ReadTcx(XmlReader reader)
    {
        var track = new TrackBuilder();
        string? sport = null;
        var calories = 0;
        var inPoint = false;
        DateTimeOffset? time = null;
        double? distance = null, ele = null, lat = null, lon = null;
        int? hr = null;
        var inHeartRate = false;

        // Reading an element's text moves past it, so those cases continue without another Read.
        reader.Read();
        while (!reader.EOF)
        {
            if (reader.NodeType == XmlNodeType.Element)
            {
                switch (reader.LocalName)
                {
                    case "Activity" when sport is null:
                        sport = reader.GetAttribute("Sport");
                        break;
                    case "Trackpoint":
                        inPoint = true;
                        time = null;
                        distance = ele = lat = lon = null;
                        hr = null;
                        break;
                    case "Time" when inPoint:
                        time = Time(reader.ReadElementContentAsString());
                        continue;
                    case "DistanceMeters" when inPoint:
                        distance = Number(reader.ReadElementContentAsString());
                        continue;
                    case "AltitudeMeters" when inPoint:
                        ele = Number(reader.ReadElementContentAsString());
                        continue;
                    case "LatitudeDegrees" when inPoint:
                        lat = Number(reader.ReadElementContentAsString());
                        continue;
                    case "LongitudeDegrees" when inPoint:
                        lon = Number(reader.ReadElementContentAsString());
                        continue;
                    case "HeartRateBpm" when inPoint:
                        inHeartRate = true;
                        break;
                    case "Value" when inHeartRate:
                        hr = (int?)Number(reader.ReadElementContentAsString());
                        continue;
                    case "Calories" when !inPoint:
                        calories += (int)(Number(reader.ReadElementContentAsString()) ?? 0);
                        continue;
                }
            }
            else if (reader.NodeType == XmlNodeType.EndElement)
            {
                if (reader.LocalName == "HeartRateBpm")
                {
                    inHeartRate = false;
                }
                else if (reader.LocalName == "Trackpoint")
                {
                    inPoint = false;
                    if (distance is { } metres)
                    {
                        track.AddDistance(time, metres, ele, hr);
                    }
                    else
                    {
                        track.AddPosition(time, lat, lon, ele, hr);
                    }
                }
            }

            reader.Read();
        }

        var kind = sport switch
        {
            "Running" => ActivityKind.Run,
            "Biking" => ActivityKind.Other,
            _ => ActivityKind.Run,
        };
        return track.ToRecording(kind, new DeviceTotals(Calories: calories > 0 ? calories : null)) with { Format = RecordingFormat.Tcx };
    }

    /// <summary>Strava writes the activity type into GPX as a word or its numeric code (9 is a run). No type: assume a run.</summary>
    private static ActivityKind GpxKind(string? type) => type?.ToLowerInvariant() switch
    {
        null or "" or "running" or "run" or "9" or "road_running" or "street_running" => ActivityKind.Run,
        "trail_running" or "trailrun" or "trail running" => ActivityKind.TrailRun,
        "treadmill_running" or "virtualrun" or "indoor_running" => ActivityKind.TreadmillRun,
        _ => ActivityKind.Other,
    };

    private static double? Number(string? text) =>
        double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) && double.IsFinite(value) ? value : null;

    private static DateTimeOffset? Time(string text) =>
        DateTimeOffset.TryParse(text.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var at) ? at : null;

    private static ValidationException Unreadable(string message) =>
        new(new Dictionary<string, string[]>(StringComparer.Ordinal) { ["file"] = [message] });

    /// <summary>Builds the samples point by point; positions only ever live in the two fields used to measure the last step.</summary>
    private sealed class TrackBuilder
    {
        private readonly List<(DateTimeOffset At, double Metres, double? Altitude, int? HeartRate)> points = [];
        private double? lastLat, lastLon;
        private double metres;

        public void AddPosition(DateTimeOffset? at, double? lat, double? lon, double? altitude, int? heartRate)
        {
            if (at is not { } time || lat is not { } la || lon is not { } lo || Math.Abs(la) > 90 || Math.Abs(lo) > 180)
            {
                return;
            }

            if (lastLat is { } pla && lastLon is { } plo)
            {
                metres += Haversine(pla, plo, la, lo);
            }

            lastLat = la;
            lastLon = lo;
            Add(time, metres, altitude, heartRate);
        }

        public void AddDistance(DateTimeOffset? at, double distance, double? altitude, int? heartRate)
        {
            if (at is { } time && distance >= 0)
            {
                Add(time, distance, altitude, heartRate);
            }
        }

        private void Add(DateTimeOffset at, double distance, double? altitude, int? heartRate)
        {
            // Time and distance only ever move forward; a point that steps back is noise.
            if (points.Count > 0 && (at <= points[^1].At || distance < points[^1].Metres))
            {
                return;
            }

            if (points.Count >= FitActivityFileReader.MaxSamples)
            {
                throw Unreadable("That activity is longer than Taperday can read.");
            }

            points.Add((at, distance, altitude, heartRate is > 0 and < 260 ? heartRate : null));
        }

        public ActivityRecording ToRecording(ActivityKind kind, DeviceTotals device)
        {
            if (points.Count < 2)
            {
                throw Unreadable("That file has no timed track points, so there's nothing to show. Export the run itself, not a route.");
            }

            var start = points[0].At;
            return new ActivityRecording(
                start,
                kind,
                [.. points.Select(p => new ActivitySample(p.At - start, p.Metres, p.Altitude, p.HeartRate))],
                device);
        }

        private static double Haversine(double lat1, double lon1, double lat2, double lon2)
        {
            static double Radians(double degrees) => degrees * Math.PI / 180;
            var dLat = Radians(lat2 - lat1);
            var dLon = Radians(lon2 - lon1);
            var a = (Math.Sin(dLat / 2) * Math.Sin(dLat / 2)) + (Math.Cos(Radians(lat1)) * Math.Cos(Radians(lat2)) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2));
            return 2 * EarthRadiusMetres * Math.Asin(Math.Min(1, Math.Sqrt(a)));
        }
    }
}
