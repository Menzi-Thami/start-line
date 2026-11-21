using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Domain.Activities;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

/// <summary>
/// The two-tap rating through the API and a real database (docs/claude-pr295-execution-contract.md, R01–R22): a rating is the
/// runner's own check-in with no Strava figure or id; it outlives the Strava copy; and the coach's own check of the week after
/// a rating counts only what the runner reported, so an unrated Strava run never looks like a missed session.
/// </summary>
public sealed class RatingAdaptationTests
{
    // Thursday 5 November, 07:00 in Johannesburg. This week: Tuesday 3 (behind), Thursday 5 (today), Sunday 8 (to come).
    private static readonly DateTimeOffset ThursdayMorning = new(2026, 11, 5, 5, 0, 0, TimeSpan.Zero);

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        response.IsSuccessStatusCode.ShouldBeTrue(body);
        return body.Length == 0 ? default : JsonDocument.Parse(body).RootElement;
    }

    private sealed record Runner(HttpClient Client, string Subject, Guid PlanId, JsonElement Plan)
    {
        public string TypeOn(string date) => Plan.GetProperty("weeks").EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray())
            .Single(s => s.GetProperty("date").GetString() == date && s.GetProperty("type").GetString() != "Strength").GetProperty("type").GetString()!;

        /// <summary>An effort two above the top of what this day's kind of run should feel (capped at 10).</summary>
        public int MuchHarderOn(string date) => Math.Min(10, StartLine.Domain.Coaching.ExpectedEffort.For(Enum.Parse<StartLine.Domain.Plans.SessionType>(TypeOn(date)))!.Value.High + 2);

        public Task<HttpResponseMessage> RateAsync(string date, object answers) =>
            Client.PutAsJsonAsync(Url($"/api/v1/me/plans/{PlanId}/check-ins/{date}/{TypeOn(date)}"), answers);

        public async Task<JsonElement> ReportedWeekAsync() => await Json(await Client.GetAsync(Url($"/api/v1/me/plans/{PlanId}/remaining-week/proposal?reported=true")));
    }

    private static async Task<Runner> SignUpAsync(StartLineApiFactory factory)
    {
        var subject = Guid.NewGuid().ToString();
        var client = factory.CreateClient().As(subject, email: $"{subject[..8]}@example.test");
        await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Synthetic runner", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true }));
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = new { raceName = "Flexible 10K", distanceKm = 10, raceDate = "2026-12-20", goalTime = "00:52:00", runDays = new[] { "Tuesday", "Thursday", "Sunday" }, longRunDay = "Sunday", currentWeeklyKm = 30, planFrom = "2026-10-19", version = 2 } }));
        var id = saved.GetProperty("id").GetGuid();
        return new Runner(client, subject, id, (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan"));
    }

    private static async Task<Guid> SeedStravaRunAsync(StartLineApiFactory factory, Runner runner, DateOnly date, double metres)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        var runnerId = await db.Runners.Where(r => r.IdentitySubject == runner.Subject).Select(r => r.Id).SingleAsync();
        var start = new DateTimeOffset(date.ToDateTime(new TimeOnly(4, 0)), TimeSpan.Zero);
        var recording = new ActivityRecording(start, ActivityKind.Run,
            [.. Enumerable.Range(0, 361).Select(i => new ActivitySample(TimeSpan.FromSeconds(i * 10), metres * i / 360, null, 150))], DeviceTotals.None);
        var run = Activity.Record(runnerId, recording, date, [], ActivityOrigin.Strava(555001, ThursdayMorning, recordedOnGarmin: true));
        db.Activities.Add(run);
        await db.SaveChangesAsync();
        return run.Id;
    }

    private static async Task<JsonElement> CheckInsAsync(Runner runner) => await Json(await runner.Client.GetAsync(Url($"/api/v1/me/plans/{runner.PlanId}/check-ins")));

    // R01 / R22: a Strava run the runner never rates stores nothing and changes nothing.
    [Fact]
    public async Task An_unrated_strava_run_stores_no_check_in_and_the_coachs_check_suggests_nothing()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(ThursdayMorning);
        var runner = await SignUpAsync(factory);
        await SeedStravaRunAsync(factory, runner, new DateOnly(2026, 11, 3), 9000);

        (await CheckInsAsync(runner)).GetArrayLength().ShouldBe(0);
        (await runner.ReportedWeekAsync()).GetProperty("changes").GetArrayLength().ShouldBe(0);
    }

    // R02 / R06: the rating is the runner's own answer, with no Strava distance, time or id, and it outlives the Strava copy.
    [Fact]
    public async Task A_two_tap_rating_saves_only_the_runners_answer_and_survives_the_strava_copy_going()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(ThursdayMorning);
        var runner = await SignUpAsync(factory);
        var stravaId = await SeedStravaRunAsync(factory, runner, new DateOnly(2026, 11, 3), 9000);

        await Json(await runner.RateAsync("2026-11-03", new { status = "Done", effort = 3, pain = "None", distanceKm = (double?)null, duration = (string?)null, activityId = (Guid?)null, note = (string?)null, actualSessionType = (string?)null, distanceUnreported = false }));
        var saved = (await CheckInsAsync(runner)).EnumerateArray().Single();
        saved.GetProperty("effort").GetInt32().ShouldBe(3);
        saved.GetProperty("status").GetString().ShouldBe("Done");
        saved.GetProperty("distanceKm").ValueKind.ShouldBe(JsonValueKind.Null);
        saved.GetProperty("duration").ValueKind.ShouldBe(JsonValueKind.Null);
        saved.GetProperty("activityId").ValueKind.ShouldBe(JsonValueKind.Null);
        saved.GetRawText().ShouldNotContain(stravaId.ToString());

        // R03: changing it updates the same check-in.
        await Json(await runner.RateAsync("2026-11-03", new { status = "Done", effort = 8, pain = "None", distanceUnreported = false }));
        var edited = await CheckInsAsync(runner);
        edited.GetArrayLength().ShouldBe(1);
        edited[0].GetProperty("effort").GetInt32().ShouldBe(8);

        // The Strava copy lapses (or the runner disconnects): their answer stays.
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
            await db.Activities.Where(a => a.Id == stravaId).ExecuteDeleteAsync();
        }
        var after = await CheckInsAsync(runner);
        after.GetArrayLength().ShouldBe(1);
        after[0].GetProperty("effort").GetInt32().ShouldBe(8);
    }

    // R07: two runs that felt much harder than they should: the coach's check suggests easing the rest of the week, applied
    // only as previewed and only in the same mode; R18: a stale or mismatched token is refused.
    [Fact]
    public async Task Two_too_hard_ratings_bring_a_reviewable_easier_week_applied_only_as_previewed()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(ThursdayMorning);
        var runner = await SignUpAsync(factory);

        await Json(await runner.RateAsync("2026-11-03", new { status = "Done", effort = runner.MuchHarderOn("2026-11-03"), pain = "None", distanceUnreported = false }));
        (await runner.ReportedWeekAsync()).GetProperty("changes").GetArrayLength().ShouldBe(0, "one hard-feeling run alone changes nothing (R15)");
        await Json(await runner.RateAsync("2026-11-05", new { status = "Done", effort = runner.MuchHarderOn("2026-11-05"), pain = "None", distanceUnreported = false }));

        var proposal = await runner.ReportedWeekAsync();
        var changes = proposal.GetProperty("changes");
        changes.GetArrayLength().ShouldBeGreaterThan(0);
        proposal.GetProperty("summary").GetString()!.ShouldContain("felt harder");
        changes.EnumerateArray().ShouldAllBe(c => string.CompareOrdinal(c.GetProperty("date").GetString(), "2026-11-05") > 0);
        var token = proposal.GetProperty("token").GetString()!;

        // Nothing changed yet; the full-week mode is a different preview, so its apply refuses this token.
        (await runner.Client.GetAsync(Url($"/api/v1/me/plans/{runner.PlanId}"))).IsSuccessStatusCode.ShouldBeTrue();
        (await runner.Client.PostAsJsonAsync(Url($"/api/v1/me/plans/{runner.PlanId}/remaining-week/apply"), new { token, reported = false })).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        await Json(await runner.Client.PostAsJsonAsync(Url($"/api/v1/me/plans/{runner.PlanId}/remaining-week/apply"), new { token, reported = true }));
        var plan = (await Json(await runner.Client.GetAsync(Url($"/api/v1/me/plans/{runner.PlanId}")))).GetProperty("plan");
        var date = changes[0].GetProperty("date").GetString()!;
        var eased = plan.GetProperty("weeks").EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray()).Single(s => s.GetProperty("date").GetString() == date && s.GetProperty("type").GetString() != "Strength");
        eased.GetProperty("type").GetString().ShouldBe("Easy");
        eased.GetProperty("distanceKm").GetDouble().ShouldBeLessThanOrEqualTo(changes[0].GetProperty("originalKm").GetDouble());

        // The same suggestion can't be applied twice.
        (await runner.Client.PostAsJsonAsync(Url($"/api/v1/me/plans/{runner.PlanId}/remaining-week/apply"), new { token, reported = true })).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        // Undo puts the day back as the plan first wrote it.
        var restored = await Json(await runner.Client.PostAsJsonAsync(Url($"/api/v1/me/plans/{runner.PlanId}/adjustments/restore"), new { dates = new[] { date } }));
        restored.GetProperty("plan").GetProperty("weeks").EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray())
            .Single(s => s.GetProperty("date").GetString() == date && s.GetProperty("type").GetString() != "Strength").GetRawText()
            .ShouldBe(runner.Plan.GetProperty("weeks").EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray())
                .Single(s => s.GetProperty("date").GetString() == date && s.GetProperty("type").GetString() != "Strength").GetRawText());
    }

    // R16: with nothing logged, the coach's own check assumes no missed run; the runner's full-week review still can.
    [Fact]
    public async Task Unlogged_days_are_not_missed_runs_for_the_coachs_own_check()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(ThursdayMorning);
        var runner = await SignUpAsync(factory);

        (await runner.ReportedWeekAsync()).GetProperty("changes").GetArrayLength().ShouldBe(0);
        (await Json(await runner.Client.GetAsync(Url($"/api/v1/me/plans/{runner.PlanId}/remaining-week/proposal")))).GetProperty("changes").GetArrayLength().ShouldBeGreaterThan(0);
    }

    // R20: another runner can't read or change this plan's week.
    [Fact]
    public async Task Another_runner_cant_see_or_apply_the_week()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(ThursdayMorning);
        var runner = await SignUpAsync(factory);
        var stranger = factory.CreateClient().As(Guid.NewGuid().ToString());
        (await stranger.GetAsync(Url($"/api/v1/me/plans/{runner.PlanId}/remaining-week/proposal?reported=true"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await stranger.PostAsJsonAsync(Url($"/api/v1/me/plans/{runner.PlanId}/remaining-week/apply"), new { token = new string('a', 64), reported = true })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }
}
