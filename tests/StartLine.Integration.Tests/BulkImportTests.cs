using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Dynastream.Fit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Domain.Activities;
using StartLine.Infrastructure.Persistence;
using Activity = StartLine.Domain.Activities.Activity;
using DateTime = System.DateTime;

namespace StartLine.Integration.Tests;

public sealed class BulkImportTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    private static readonly DateTime Morning = new(2026, 10, 9, 3, 0, 0, DateTimeKind.Utc);

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private async Task<HttpClient> SignedUp()
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), new
        {
            displayName = "Thandi",
            timeZone = "Africa/Johannesburg",
            units = "Kilometres",
            weeklyEmails = false,
            acceptPrivacyNotice = true,
        })).EnsureSuccessStatusCode();
        return client;
    }

    private static Task<HttpResponseMessage> Batch(HttpClient client, params (string Name, byte[] Bytes)[] files)
    {
        var content = new MultipartFormDataContent();
        foreach (var (name, bytes) in files)
        {
            var part = new ByteArrayContent(bytes);
            part.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            content.Add(part, "files", name);
        }

        return client.PostAsync(Url("/api/v1/me/activities/batch"), content);
    }

    private static async Task<List<JsonElement>> Results(HttpResponseMessage response)
    {
        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return [.. JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("files").EnumerateArray()];
    }

    private static string Status(JsonElement result) => result.GetProperty("status").GetString()!;

    [Fact]
    public async Task Every_file_gets_its_own_result_and_one_bad_file_never_fails_the_batch()
    {
        var client = await SignedUp();

        var results = await Results(await Batch(client,
            ("tuesday.fit", FitFiles.Run(Morning, 8000, 330)),
            ("ride.fit", FitFiles.Run(Morning.AddDays(1), 30_000, 120, Sport.Cycling, SubSport.Road)),
            ("notes.fit", "not a fit file"u8.ToArray()),
            ("thursday.fit", FitFiles.Run(Morning.AddDays(2), 6000, 340))));

        results.Select(r => r.GetProperty("name").GetString()).ShouldBe(["tuesday.fit", "ride.fit", "notes.fit", "thursday.fit"]);
        results.Select(Status).ShouldBe(["Imported", "Skipped", "Unreadable", "Imported"]);
        results[0].GetProperty("activity").GetProperty("distanceKm").GetDouble().ShouldBe(8, tolerance: 0.01);
        results[1].GetProperty("message").GetString()!.ShouldContain("only reads runs");
        results[2].GetProperty("message").GetString()!.ShouldContain("isn't a .fit file");
        (await client.GetFromJsonAsync<JsonElement>(Url("/api/v1/me/activities"))).GetArrayLength().ShouldBe(2);
    }

    [Fact]
    public async Task A_run_already_uploaded_or_sent_twice_in_one_batch_is_kept_once()
    {
        var client = await SignedUp();
        var run = FitFiles.Run(Morning, 5000, 300);
        (await Results(await Batch(client, ("first.fit", run)))).Select(Status).ShouldBe(["Imported"]);

        var results = await Results(await Batch(client, ("again.fit", run), ("new.fit", FitFiles.Run(Morning.AddDays(3), 5000, 310)),
            ("new-copy.fit", FitFiles.Run(Morning.AddDays(3), 5000, 310))));

        results.Select(Status).ShouldBe(["AlreadyUploaded", "Imported", "AlreadyUploaded"]);
        (await client.GetFromJsonAsync<JsonElement>(Url("/api/v1/me/activities"))).GetArrayLength().ShouldBe(2);
    }

    [Fact]
    public async Task A_batch_is_at_most_twenty_files()
    {
        var file = FitFiles.Run(Morning, 1000, 300);

        var response = await Batch(await SignedUp(), [.. Enumerable.Range(0, 21).Select(i => ($"{i}.fit", file))]);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task A_batch_needs_at_least_one_file() =>
        (await (await SignedUp()).PostAsync(Url("/api/v1/me/activities/batch"), new MultipartFormDataContent { { new StringContent("x"), "note" } }))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest);

    [Fact]
    public async Task Only_signed_up_runners_can_import()
    {
        var response = await Batch(factory.CreateClient().As(Guid.NewGuid().ToString()), ("run.fit", FitFiles.Run(Morning, 5000, 300)));

        response.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await factory.CreateClient().PostAsync(Url("/api/v1/me/activities/batch"), new MultipartFormDataContent())).StatusCode
            .ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task At_the_limit_the_rest_of_the_batch_is_reported_and_not_read()
    {
        var client = await SignedUp();
        var me = await client.GetFromJsonAsync<JsonElement>(Url("/api/v1/me"));
        var runnerId = me.GetProperty("id").GetGuid();
        await SeedRuns(runnerId, Activity.MaxPerRunner - 1);

        var results = await Results(await Batch(client,
            ("last-one.fit", FitFiles.Run(Morning, 3000, 300)),
            ("over.fit", FitFiles.Run(Morning.AddDays(1), 3000, 300)),
            ("also-over.fit", FitFiles.Run(Morning.AddDays(2), 3000, 300))));

        results.Select(Status).ShouldBe(["Imported", "LimitReached", "LimitReached"]);
        results[1].GetProperty("message").GetString()!.ShouldContain("1,000");
    }

    /// <summary>Fills a runner's history straight into the database: uploading a thousand files would take minutes.</summary>
    private async Task SeedRuns(Guid runnerId, int count)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        var start = new DateTimeOffset(2020, 1, 1, 5, 0, 0, TimeSpan.Zero);
        ActivitySample[] samples = [new(TimeSpan.Zero, 0), new(TimeSpan.FromSeconds(120), 400)];
        for (var i = 0; i < count; i++)
        {
            var recording = new ActivityRecording(start.AddDays(i), ActivityKind.Run, samples, DeviceTotals.None);
            db.Activities.Add(Activity.Record(runnerId, recording, DateOnly.FromDateTime(start.AddDays(i).UtcDateTime), []));
        }

        await db.SaveChangesAsync();
        (await db.Activities.CountAsync(a => a.RunnerId == runnerId)).ShouldBe(count);
    }
}
