# Email (hello@taperday.run and Brevo)

## Receiving: hello@taperday.run

Spaceship's free **Email forwarding** (Domain Manager → taperday.run → Email forwarding) sends `hello@taperday.run` to the maker's Gmail. Its MX records and SPF (`v=spf1 include:spf.efwd.spaceship.net ~all`) are in the **Email Forwarding** group in Spaceship's Advanced DNS. Leave them alone, or `hello@` stops receiving mail.

## Sending: Brevo (free plan, 300 emails a day)

`taperday.run` is authenticated in Brevo (since 2026-10-30), so mail sent **from** `hello@taperday.run` passes spam checks. These are the DNS records in Spaceship's Advanced DNS (custom records):

| Host | Type | Value | Purpose |
|---|---|---|---|
| `@` | TXT | `brevo-code:…` | Proves Brevo account ownership |
| `brevo1._domainkey` | CNAME | `b1.taperday-run.dkim.brevo.com` | DKIM signature, part 1 |
| `brevo2._domainkey` | CNAME | `b2.taperday-run.dkim.brevo.com` | DKIM signature, part 2 |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` | DMARC: report, don't block |

There is only one SPF record. If a provider ever needs SPF too, add an `include:` to the existing record; never add a second `v=spf1` record.

### The API key (what the app uses)

- **Where it lives:** the App Service setting `Email__BrevoApiKey` on `app-taperday-api-3ghg5t`, and nowhere else. Not in the repo, appsettings, chat or email.
- **Permissions:** Restricted, with **Transactional email: All** and everything else None.
- **Expiry:** 1 year (made 2026-10-30, so it expires 2027-10-30). Brevo also expires keys after **90 days unused**. The maker's Monday report used to keep it alive; it's retired, so **turn the weekly recap on (`RunnerWeeklyRecap__Enabled`) within 90 days of the last send**, or the key lapses and needs replacing.
- **Lost, leaked or expired:** generate a new key in Brevo (SMTP & API → API Keys), paste it into the same App Service setting, then delete the old key in Brevo. No code change is needed.

### Brevo MCP key (future: email campaigns with an AI assistant)

Brevo also issues **MCP** keys, which let an AI assistant (such as Claude Code) work inside the Brevo account: contacts, campaigns and stats. It is a different key from the app's API key, and the app doesn't use it.

- **Don't make one until it's needed.** An unused key expires after 90 days.
- **When running campaigns:** generate it then, with only the permissions the campaign needs (contacts and email campaigns), add it to Claude Code's MCP configuration on the maker's PC through an environment variable, and keep the backup in a password manager.
- **Never** commit it to this repo, put it in App Service settings, or paste it into chat. Campaigns also need runners' consent to marketing email (POPIA), which Taperday doesn't collect yet: the `WeeklyEmails` setting covers Taperday's own weekly email, not marketing.

## The weekly recap

The runner's own weekly email, for runners who tick **weekly recap** in their profile (`Runner.WeeklyEmails`). It replaces the maker's Monday report, which is retired. The full write-up is in [runner-weekly-recap.md](runner-weekly-recap.md).

- `RunnerWeeklyRecap__Enabled`: `true` sends recaps at 07:00 on each runner's own Monday. **Off by default.**
- `RunnerWeeklyRecap__TestTo`: set it to an address and the app sends one made-up preview (subject starts `[Test]`) when it next starts. Saving the setting restarts the app. **Clear it afterwards**, or every restart sends another.
- No `Email__BrevoApiKey` means nothing is sent, and the log says so.

## Update emails and unsubscribing

"What's new" emails about Taperday itself (`UpdateEmails`, such as Race Plan v3) and the weekly recap are the emails meant for runners. Every runner copy carries a way out, for its own list only; a preview to the maker has none.

### The preference

- `Runner.UpdateEmailsOffAt`: null means the runner gets news and updates (the default, for new and existing runners alike); a time means they turned them off then. `Runner.UpdateEmails` reads it as a yes or no.
- Runners turn it back on (or off) in Account: the "Taperday news and updates" box, saved with the profile (`SaveProfileCommand.UpdateEmails`). Leaving the field out changes nothing, so an older app can never re-subscribe anyone.
- It's in `RunnerDto`, so the account export shows it and when it was turned off.
- It's separate from `WeeklyEmails` (the weekly recap, which has its own unsubscribe key) and is not marketing consent: campaigns still need their own opt-in (see the Brevo MCP section).

### The unsubscribe key

`IUnsubscribeTokens` (`DataProtectionUnsubscribeTokens`) encrypts and authenticates the runner's id with Data Protection under its own purpose, `StartLine.Email.Unsubscribe.v1`, on the same key ring as Strava tokens and "Tick it" keys. It has **no expiry**: an old email's link must still work. Data Protection keeps retired keys for reading, so key rotation doesn't break old links; only losing the key ring would. A key that's been tampered with, cut short or made for another purpose is refused (`ValidationException`, a 400). A key names its list: `u1` keys (all keys issued before the recap) turn update emails off, `w1` keys turn the weekly recap off. A key can only ever turn its own list off.

### Two ways out of every email

| Where | Address | What happens |
|---|---|---|
| Footer link (`EmailLayout.Wrap`'s `unsubscribeUrl`) | `https://taperday.run/?view=unsubscribe&t=KEY` | Taperday's own page, no sign-in. One line and an Unsubscribe button, which posts `{ "token": KEY }` to the API. It asks first, so a mail scanner that opens every link can't unsubscribe anyone. |
| Mail app's own button (RFC 8058) | `{Email:ApiBaseUrl}/api/v1/unsubscribe?t=KEY` | The mail app posts `List-Unsubscribe=One-Click` as a form. Gmail and Yahoo expect this of bulk mail. |

`BrevoEmailSender` adds these headers (Brevo's `headers` field) when the email carries `UnsubscribeLinks`:

```
List-Unsubscribe: <https://app-taperday-api-3ghg5t.azurewebsites.net/api/v1/unsubscribe?t=KEY>, <mailto:hello@taperday.run?subject=unsubscribe>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

A mailto unsubscribe lands in the maker's Gmail (via `hello@` forwarding) and has to be done by hand in the database or by asking the runner to use the link; it's there for the few mail apps that only offer email.

`POST /api/v1/unsubscribe` is anonymous, rate-limited per IP like `POST /api/v1/ticks`, idempotent (a second unsubscribe keeps the first time) and answers 204. A good key for an account since deleted also gets 204, so the link never tells a stranger whether an account exists. The one-click address carries the key in the query, so `SecretPaths` drops `url.query` and `url.full` from its traces; ASP.NET Core's own request logs (which print the full URL) stay off because `Microsoft.AspNetCore` logs at Warning.

### Settings

- `Email__ApiBaseUrl`: the API's public address for the one-click header. Defaults to `https://app-taperday-api-3ghg5t.azurewebsites.net`, the live API; set it only if the API moves (a custom domain, say).
- The footer link always goes to `https://taperday.run` (`EmailLayout.Site`).

### Sending one to every runner

`UpdateBroadcast` composes one email per runner with an email address and update emails on, each with that runner's own key (`RacePlanV3Async`, or `ComposeAsync` for any other update). It only composes: nothing sends a broadcast yet, and there's no schedule. Before wiring a trigger:

- Make it one-off and safe across restarts: record what was sent to whom (a marker per runner and email, saved before sending) so an App Service restart can never send it twice.
- Mind Brevo's free plan: **300 emails a day**. A broadcast bigger than that has to be spread over days.
- Send a test to `hello@` first: the preview, without unsubscribe links, as it's for the maker.
