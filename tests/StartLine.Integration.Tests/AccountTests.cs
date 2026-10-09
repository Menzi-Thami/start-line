using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace StartLine.Integration.Tests;

public sealed class AccountTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    private static readonly object Profile = new
    {
        displayName = "Thandi",
        timeZone = "Africa/Johannesburg",
        units = "Kilometres",
        weeklyEmails = true,
        acceptPrivacyNotice = true,
    };

    private static readonly object ComradesPlan = new
    {
        raceSlug = "comrades-2027",
        goalTime = "10:30:00",
        runDays = new[] { "Tuesday", "Wednesday", "Thursday", "Saturday", "Sunday" },
        longRunDay = "Sunday",
        currentWeeklyKm = 40,
    };

    private static Uri Url(string path) => new(path, UriKind.Relative);

    // Every test signs in as a brand-new runner, so tests never see each other's data.
    private HttpClient NewRunner(string? email = null) => factory.CreateClient().As(Guid.NewGuid().ToString(), email);

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private static async Task<HttpClient> SignedUp(HttpClient client)
    {
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();
        return client;
    }

    private static async Task<Guid> Save(HttpClient client, object? plan = null, string? name = null)
    {
        var response = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { name, plan = plan ?? ComradesPlan });
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        return (await Json(response)).GetProperty("id").GetGuid();
    }

    [Fact]
    public async Task Anonymous_callers_get_a_401_problem()
    {
        var response = await factory.CreateClient().GetAsync(Url("/api/v1/me"));

        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
    }

    [Fact]
    public async Task A_token_without_the_app_scope_is_forbidden()
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString(), scopes: "openid profile");

        (await client.GetAsync(Url("/api/v1/me"))).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task The_public_plan_builder_still_needs_no_sign_in()
    {
        var response = await factory.CreateClient().PostAsJsonAsync(Url("/api/v1/plans"), ComradesPlan);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task There_is_no_profile_until_the_runner_signs_up()
    {
        (await NewRunner().GetAsync(Url("/api/v1/me"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Signing_up_requires_accepting_the_privacy_notice()
    {
        var response = await NewRunner().PutAsJsonAsync(Url("/api/v1/me"), new
        {
            displayName = "Thandi",
            timeZone = "Africa/Johannesburg",
            units = "Kilometres",
            weeklyEmails = true,
            acceptPrivacyNotice = false,
        });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Json(response)).GetProperty("errors").TryGetProperty("AcceptPrivacyNotice", out _).ShouldBeTrue();
    }

    [Fact]
    public async Task Signing_up_takes_the_email_from_the_token_and_updating_keeps_the_same_runner()
    {
        var client = NewRunner(email: "thandi@example.com");

        var first = await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), Profile));
        var second = await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new
        {
            displayName = "Thandi M",
            timeZone = "Europe/London",
            units = "Miles",
            weeklyEmails = false,
            acceptPrivacyNotice = false,
        }));

        first.GetProperty("email").GetString().ShouldBe("thandi@example.com");
        second.GetProperty("id").GetGuid().ShouldBe(first.GetProperty("id").GetGuid());
        second.GetProperty("displayName").GetString().ShouldBe("Thandi M");
        second.GetProperty("units").GetString().ShouldBe("Miles");
    }

    [Fact]
    public async Task An_unknown_time_zone_is_rejected()
    {
        var response = await NewRunner().PutAsJsonAsync(Url("/api/v1/me"), new
        {
            displayName = "Thandi",
            timeZone = "Mars/Olympus_Mons",
            units = "Kilometres",
            weeklyEmails = true,
            acceptPrivacyNotice = true,
        });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task A_double_tapped_sign_up_creates_one_runner()
    {
        var subject = Guid.NewGuid().ToString();
        var a = factory.CreateClient().As(subject);
        var b = factory.CreateClient().As(subject);

        var responses = await Task.WhenAll(a.PutAsJsonAsync(Url("/api/v1/me"), Profile), b.PutAsJsonAsync(Url("/api/v1/me"), Profile));

        responses.ShouldAllBe(r => r.StatusCode == HttpStatusCode.OK);
        var ids = await Task.WhenAll(responses.Select(async r => (await Json(r)).GetProperty("id").GetGuid()));
        ids.Distinct().Count().ShouldBe(1);
    }

    [Fact]
    public async Task Saving_a_plan_needs_a_finished_sign_up()
    {
        var response = await NewRunner().PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = ComradesPlan });

        response.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await Json(response)).GetProperty("code").GetString().ShouldBe("registration_required");
    }

    [Fact]
    public async Task A_saved_plan_can_be_listed_and_reopened_as_a_full_plan()
    {
        var client = await SignedUp(NewRunner());

        var response = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { name = "Comrades: the big one", plan = ComradesPlan });
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        response.Headers.Location.ShouldNotBeNull();
        var id = (await Json(response)).GetProperty("id").GetGuid();

        var list = (await Json(await client.GetAsync(Url("/api/v1/me/plans")))).EnumerateArray().ToList();
        list.ShouldHaveSingleItem().GetProperty("name").GetString().ShouldBe("Comrades: the big one");

        var saved = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")));
        saved.GetProperty("plan").GetProperty("race").GetProperty("name").GetString().ShouldBe("Comrades Marathon");
        saved.GetProperty("plan").GetProperty("weeks").GetArrayLength().ShouldBeGreaterThan(0);
        saved.GetProperty("inputs").GetProperty("runDays").GetArrayLength().ShouldBe(5);
        saved.GetProperty("inputs").GetProperty("planFrom").GetString().ShouldBe("2026-10-08");
    }

    [Fact]
    public async Task A_plan_without_a_name_is_named_after_its_race()
    {
        var client = await SignedUp(NewRunner());
        await Save(client);

        var list = await Json(await client.GetAsync(Url("/api/v1/me/plans")));

        list[0].GetProperty("name").GetString().ShouldBe("Comrades Marathon");
    }

    [Fact]
    public async Task Another_runner_can_neither_see_nor_delete_my_plan()
    {
        var me = await SignedUp(NewRunner());
        var id = await Save(me);
        var someoneElse = await SignedUp(NewRunner());

        (await someoneElse.GetAsync(Url($"/api/v1/me/plans/{id}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await someoneElse.DeleteAsync(Url($"/api/v1/me/plans/{id}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await Json(await someoneElse.GetAsync(Url("/api/v1/me/plans")))).GetArrayLength().ShouldBe(0);
        (await me.GetAsync(Url($"/api/v1/me/plans/{id}"))).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task A_deleted_plan_is_gone()
    {
        var client = await SignedUp(NewRunner());
        var id = await Save(client);

        (await client.DeleteAsync(Url($"/api/v1/me/plans/{id}"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.GetAsync(Url($"/api/v1/me/plans/{id}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task A_plan_that_fails_validation_is_not_saved()
    {
        var client = await SignedUp(NewRunner());

        var response = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new
        {
            plan = new { raceSlug = "comrades-2027", goalTime = "00:10:00", runDays = new[] { "Sunday" }, longRunDay = "Sunday" },
        });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Json(await client.GetAsync(Url("/api/v1/me/plans")))).GetArrayLength().ShouldBe(0);
    }

    [Fact]
    public async Task Runners_can_keep_at_most_twenty_plans()
    {
        var client = await SignedUp(NewRunner());
        for (var i = 0; i < 20; i++)
        {
            await Save(client);
        }

        var response = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = ComradesPlan });

        response.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await Json(response)).GetProperty("code").GetString().ShouldBe("plan_limit");
    }

    [Fact]
    public async Task Export_returns_everything_as_a_download()
    {
        var client = await SignedUp(NewRunner(email: "thandi@example.com"));
        await Save(client);

        var response = await client.GetAsync(Url("/api/v1/me/export"));

        response.Content.Headers.ContentDisposition?.DispositionType.ShouldBe("attachment");
        var export = await Json(response);
        export.GetProperty("profile").GetProperty("email").GetString().ShouldBe("thandi@example.com");
        export.GetProperty("plans").GetArrayLength().ShouldBe(1);
    }

    [Fact]
    public async Task Deleting_the_account_removes_the_runner_and_every_plan()
    {
        var client = await SignedUp(NewRunner());
        var id = await Save(client);

        (await client.DeleteAsync(Url("/api/v1/me"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (await client.GetAsync(Url("/api/v1/me"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await client.GetAsync(Url($"/api/v1/me/plans/{id}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await client.DeleteAsync(Url("/api/v1/me"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
    }
}
