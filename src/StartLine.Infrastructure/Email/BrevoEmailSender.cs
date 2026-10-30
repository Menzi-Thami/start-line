using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using StartLine.Application.Features.Insights;

namespace StartLine.Infrastructure.Email;

/// <summary>Email settings: the Brevo API key (App Service only, never in the repo) and who mail is from.</summary>
internal sealed class EmailOptions
{
    public const string Section = "Email";

    public string BrevoApiKey { get; set; } = "";

    public string From { get; set; } = "hello@taperday.run";

    public string FromName { get; set; } = "Taperday";

    /// <summary>
    /// The API's public address, where a mail app's one-click unsubscribe posts (List-Unsubscribe). The API doesn't know
    /// its own public name behind App Service, so it's configured; the default is the live API.
    /// </summary>
    public Uri ApiBaseUrl { get; set; } = new("https://app-taperday-api-3ghg5t.azurewebsites.net");
}

/// <summary>What composing an email needs from <see cref="EmailOptions"/>.</summary>
internal sealed class EmailSettings(IOptions<EmailOptions> options) : IEmailSettings
{
    public Uri ApiBaseUrl => options.Value.ApiBaseUrl;
}

/// <summary>Sends through Brevo's transactional API (docs/email.md). The key goes in a header and is never logged.</summary>
internal sealed class BrevoEmailSender(HttpClient http, IOptions<EmailOptions> options) : IEmailSender
{
    // Web casing as Brevo expects, and nulls left out rather than sent: an email without headers sends no "headers" at all.
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    public bool Configured => !string.IsNullOrWhiteSpace(options.Value.BrevoApiKey);

    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(message);
        var o = options.Value;
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri("https://api.brevo.com/v3/smtp/email"))
        {
            Content = JsonContent.Create(new
            {
                sender = new { name = o.FromName, email = o.From },
                to = new[] { new { email = message.To } },
                subject = message.Subject,
                htmlContent = message.Html,
                textContent = message.Text,
                headers = Headers(message.Unsubscribe),
            }, options: Json),
        };
        request.Headers.Add("api-key", o.BrevoApiKey);
        using var response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"Brevo turned the email away ({(int)response.StatusCode}).");
        }
    }

    /// <summary>
    /// The headers mail apps read to show their own Unsubscribe button: the one-click address (RFC 8058, which Gmail and
    /// Yahoo expect of bulk mail) and a mailto for apps that only do email. Null when the email has none, so Brevo's
    /// payload leaves the field out.
    /// </summary>
    internal static Dictionary<string, string>? Headers(UnsubscribeLinks? unsubscribe) => unsubscribe is null
        ? null
        : new(StringComparer.Ordinal)
        {
            ["List-Unsubscribe"] = $"<{unsubscribe.OneClick.AbsoluteUri}>, <mailto:hello@taperday.run?subject=unsubscribe>",
            ["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click",
        };
}

/// <summary>Who the Monday report goes to, and an address for a one-off test sent when the app starts.</summary>
internal sealed class ReportOptions
{
    public const string Section = "Report";

    public string To { get; set; } = "hello@taperday.run";

    /// <summary>Set it, and the app sends one report there when it starts; clear it again after. For trying the email out.</summary>
    public string SendTestTo { get; set; } = "";
}
