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
- **Expiry:** 1 year (made 2026-10-30, so it expires 2027-10-30). Brevo also expires keys after **90 days unused**. The weekly report uses it every Monday, which keeps it alive.
- **Lost, leaked or expired:** generate a new key in Brevo (SMTP & API → API Keys), paste it into the same App Service setting, then delete the old key in Brevo. No code change is needed.

### Brevo MCP key (future: email campaigns with an AI assistant)

Brevo also issues **MCP** keys, which let an AI assistant (such as Claude Code) work inside the Brevo account: contacts, campaigns and stats. It is a different key from the app's API key, and the app doesn't use it.

- **Don't make one until it's needed.** An unused key expires after 90 days.
- **When running campaigns:** generate it then, with only the permissions the campaign needs (contacts and email campaigns), add it to Claude Code's MCP configuration on the maker's PC through an environment variable, and keep the backup in a password manager.
- **Never** commit it to this repo, put it in App Service settings, or paste it into chat. Campaigns also need runners' consent to marketing email (POPIA), which Taperday doesn't collect yet: the `WeeklyEmails` setting covers Taperday's own weekly email, not marketing.

## The Monday report

`WeeklyReportWorker` (Infrastructure/Email) emails the maker every **Monday at 07:00 South African time**. It covers runners (and new ones), how far they got (current plan, runs, Strava, reminders), who ran this week, runs stored and the week's feedback. Counts only, no names.

- `Report__To`: who gets it. Defaults to `hello@taperday.run`, which forwards to the maker's Gmail.
- `Report__SendTestTo`: set it to an address and the app sends one report (subject starts `[Test]`) when it next starts. Saving the setting restarts the app. **Clear it afterwards**, or every restart sends another.
- No `Email__BrevoApiKey` means nothing is sent, and the log says so.
