using System.Net.Http.Json;
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
}

/// <summary>Sends through Brevo's transactional API (docs/email.md). The key goes in a header and is never logged.</summary>
internal sealed class BrevoEmailSender(HttpClient http, IOptions<EmailOptions> options) : IEmailSender
{
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
            }),
        };
        request.Headers.Add("api-key", o.BrevoApiKey);
        using var response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"Brevo turned the email away ({(int)response.StatusCode}).");
        }
    }
}

/// <summary>Who the Monday report goes to, and an address for a one-off test sent when the app starts.</summary>
internal sealed class ReportOptions
{
    public const string Section = "Report";

    public string To { get; set; } = "hello@taperday.run";

    /// <summary>Set it, and the app sends one report there when it starts; clear it again after. For trying the email out.</summary>
    public string SendTestTo { get; set; } = "";
}
