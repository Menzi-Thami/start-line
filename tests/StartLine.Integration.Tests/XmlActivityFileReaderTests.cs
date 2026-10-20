using System.Globalization;
using System.Text;
using StartLine.Application.Common.Exceptions;
using StartLine.Domain.Activities;
using StartLine.Infrastructure.Activities;

namespace StartLine.Integration.Tests;

/// <summary>The GPX and TCX readers: real distance and heart rate out, no positions kept, and hostile XML refused.</summary>
public sealed class XmlActivityFileReaderTests
{
    private static MemoryStream Xml(string text) => new(Encoding.UTF8.GetBytes(text));

    private static ActivityRecording Read(string text) => XmlActivityFileReader.Read(Xml(text));

    // A GPX track: a point a second, 3 m apart along a line of longitude, so distance adds up predictably.
    private static string Gpx(int points, double metresApart = 3, string? type = "running", bool withHr = true)
    {
        var sb = new StringBuilder();
        sb.Append("<?xml version=\"1.0\"?><gpx version=\"1.1\" xmlns=\"http://www.topografix.com/GPX/1/1\"><trk>");
        if (type is not null)
        {
            sb.Append("<type>").Append(type).Append("</type>");
        }

        sb.Append("<trkseg>");
        // Match the reader's haversine radius so 3 m apart is exactly 3 m, not an approximation.
        var degPerMetre = 360.0 / (2 * Math.PI * 6_371_008.8);
        var start = new DateTime(2026, 10, 18, 4, 30, 0, DateTimeKind.Utc);
        for (var i = 0; i < points; i++)
        {
            var lon = i * metresApart * degPerMetre;
            sb.Append("<trkpt lat=\"0.0\" lon=\"").Append(lon.ToString("F8", CultureInfo.InvariantCulture)).Append("\">");
            sb.Append("<ele>100</ele><time>").Append(start.AddSeconds(i).ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)).Append("</time>");
            if (withHr)
            {
                sb.Append("<extensions><gpxtpx:TrackPointExtension xmlns:gpxtpx=\"x\"><gpxtpx:hr>150</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>");
            }

            sb.Append("</trkpt>");
        }

        sb.Append("</trkseg></trk></gpx>");
        return sb.ToString();
    }

    private static string Tcx(int points, double metresApart = 3)
    {
        var sb = new StringBuilder();
        sb.Append("<?xml version=\"1.0\"?><TrainingCenterDatabase xmlns=\"http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2\">");
        sb.Append("<Activities><Activity Sport=\"Running\"><Lap><Calories>420</Calories><Track>");
        var start = new DateTime(2026, 10, 18, 4, 30, 0, DateTimeKind.Utc);
        for (var i = 0; i < points; i++)
        {
            sb.Append("<Trackpoint><Time>").Append(start.AddSeconds(i).ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)).Append("</Time>");
            sb.Append("<DistanceMeters>").Append((i * metresApart).ToString("F1", CultureInfo.InvariantCulture)).Append("</DistanceMeters>");
            sb.Append("<AltitudeMeters>100</AltitudeMeters><HeartRateBpm><Value>150</Value></HeartRateBpm></Trackpoint>");
        }

        sb.Append("</Track></Lap></Activity></Activities></TrainingCenterDatabase>");
        return sb.ToString();
    }

    [Fact]
    public void A_gpx_run_becomes_distance_time_and_heart_rate_samples()
    {
        var recording = Read(Gpx(1001)); // 1000 gaps x 3 m = 3000 m, over 1000 s

        recording.Kind.ShouldBe(ActivityKind.Run);
        recording.StartedAt.ShouldBe(new DateTimeOffset(2026, 10, 18, 4, 30, 0, TimeSpan.Zero));
        recording.Samples.Count.ShouldBe(1001);
        recording.Samples[^1].DistanceMetres.ShouldBe(3000, tolerance: 1);
        recording.Samples[^1].Elapsed.ShouldBe(TimeSpan.FromSeconds(1000));
        recording.Samples.ShouldAllBe(s => s.HeartRate == 150);
    }

    [Fact]
    public void A_gpx_run_measured_through_the_whole_pipeline_has_the_right_splits()
    {
        // 5 km at 3 m/s: the domain should read five even kilometres.
        var run = Activity.Record(Guid.NewGuid(), Read(Gpx(5001)), new DateOnly(2026, 10, 18), []);

        run.DistanceMetres.ShouldBe(15_000, tolerance: 2);
        run.Splits.Count.ShouldBe(15);
    }

    [Fact]
    public void A_tcx_run_uses_its_own_distance_and_calories()
    {
        var recording = Read(Tcx(1001));

        recording.Kind.ShouldBe(ActivityKind.Run);
        recording.Samples[^1].DistanceMetres.ShouldBe(3000, tolerance: 0.1);
        recording.Device.Calories.ShouldBe(420);
    }

    [Theory]
    [InlineData("trail_running", ActivityKind.TrailRun)]
    [InlineData("9", ActivityKind.Run)]
    [InlineData("virtualrun", ActivityKind.TreadmillRun)]
    public void Gpx_activity_types_map_to_run_kinds(string type, ActivityKind expected) =>
        Read(Gpx(3, type: type)).Kind.ShouldBe(expected);

    [Fact]
    public void A_file_with_fewer_than_two_points_is_refused_kindly()
    {
        var e = Should.Throw<ValidationException>(() => Read(Gpx(1)));
        e.Errors["file"][0].ShouldContain("no timed track points");
    }

    [Fact]
    public void A_route_with_no_times_is_refused()
    {
        var noTimes = "<?xml version=\"1.0\"?><gpx><trk><trkseg><trkpt lat=\"0\" lon=\"0\"/><trkpt lat=\"0\" lon=\"0.001\"/></trkseg></trk></gpx>";
        Should.Throw<ValidationException>(() => Read(noTimes));
    }

    [Fact]
    public void An_xxe_external_entity_is_never_resolved()
    {
        // The classic file-exfiltration payload: with a resolver it would read the host file. It must be refused, not read.
        var xxe = "<?xml version=\"1.0\"?><!DOCTYPE gpx [<!ENTITY xxe SYSTEM \"file:///C:/Windows/win.ini\">]><gpx><trk><trkseg><trkpt lat=\"0\" lon=\"0\"><time>&xxe;</time></trkpt></trkseg></trk></gpx>";

        var e = Should.Throw<ValidationException>(() => Read(xxe));
        e.Errors["file"][0].ShouldNotContain("[fonts]");
    }

    [Fact]
    public void A_billion_laughs_entity_expansion_is_refused()
    {
        var bomb = "<?xml version=\"1.0\"?><!DOCTYPE lolz [<!ENTITY lol \"lol\"><!ENTITY lol2 \"&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;\"><!ENTITY lol3 \"&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;\">]><gpx><trk><trkseg><trkpt lat=\"0\" lon=\"0\"><time>&lol3;</time></trkpt></trkseg></trk></gpx>";

        Should.Throw<ValidationException>(() => Read(bomb));
    }

    [Fact]
    public void Something_that_is_not_gpx_or_tcx_is_refused()
    {
        Should.Throw<ValidationException>(() => Read("<?xml version=\"1.0\"?><html><body>hello</body></html>"));
    }

    [Fact]
    public void A_position_that_jumps_backwards_in_time_is_ignored()
    {
        var start = new DateTime(2026, 10, 18, 4, 30, 0, DateTimeKind.Utc);
        var xml = $"<?xml version=\"1.0\"?><gpx><trk><trkseg>" +
            $"<trkpt lat=\"0\" lon=\"0\"><time>{start.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)}</time></trkpt>" +
            $"<trkpt lat=\"0\" lon=\"0.0001\"><time>{start.AddSeconds(-50).ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)}</time></trkpt>" +
            $"<trkpt lat=\"0\" lon=\"0.001\"><time>{start.AddSeconds(10).ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)}</time></trkpt>" +
            $"</trkseg></trk></gpx>";

        Read(xml).Samples.Count.ShouldBe(2);
    }
}
