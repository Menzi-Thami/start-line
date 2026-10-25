# Taperday security and robustness posture

Where Taperday stands against the common web-security and reliability checklist, as of October 2026. It was reviewed
by a dedicated security pass over the code (no critical or high findings). Status key:

- **Covered** — in place and tested.
- **Partial** — handled, with a known limit or a follow-up.
- **Gap** — a real thing to do, listed in [To do](#to-do).
- **N/A** — for systems Taperday doesn't have (it's a small .NET API + SPA + one SQL database, no queues, no caches, no
  microservices), so most of a big "distributed systems" list doesn't apply.

Taperday is a free running-plan app: a .NET 10 API, a React SPA, EF Core on Azure SQL, Entra External ID sign-in, on
Azure App Service and Static Web Apps. It holds no payment data. Heart rate is the most sensitive data it stores.

## Application security

| # | Topic | Status | Where / note |
|---|---|---|---|
| 1 | SQL injection | Covered | All data access is EF Core LINQ. No raw SQL (`FromSql`/`ExecuteSql`), no string-built queries. The one migration `Sql(...)` is a fixed statement with no user input. |
| 2 | XSS | Covered | React escapes by default; no `dangerouslySetInnerHTML`. The SPA's CSP forbids inline and eval scripts. |
| 3 | CSRF | Covered | The API takes a bearer token in the `Authorization` header, not a cookie, so there's nothing for a cross-site form to ride. The Strava OAuth `state` is signed and runner-bound (`DataProtectionConnectState`). |
| 4 | CORS | Covered | Explicit origin allow-list (`Cors:AllowedOrigins`), specific methods and headers, no credentials. Empty by default. |
| 5 | SSRF | Covered | The only URL a runner gives the API is a browser's push endpoint for reminders, and it's accepted only as HTTPS on the default port to a known push service (`Push:AllowedHosts`: Google, Apple, Mozilla, Microsoft), with tests. Every other outbound call goes to fixed Strava hosts from config. |
| 6 | IDOR | Covered | Every `me/*` query is scoped by the runner id from the validated token, never from the body. Another runner's row returns 404, not 403. |
| 7 | Path traversal | Covered | No file paths come from users. Uploads are read in memory; zip entry names are never used as paths. |
| 8 | Mass assignment | Covered | Requests bind to explicit DTOs; the runner id and email come from the token, not the body. |
| 9 | Clickjacking | Covered | `frame-ancestors 'none'` in the SPA CSP; `X-Frame-Options` via the security headers. |
| 10 | Content Security Policy | Covered | API: `default-src 'none'`. SPA: `script-src 'self'` (no unsafe-inline/eval), scoped `connect-src`/`frame-src`, `object-src 'none'`. `client/public/staticwebapp.config.json`. |
| 11 | Security headers | Covered | HSTS (`UseHsts`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP. `SecurityHeadersMiddleware` and the SWA config. |
| 12 | Input validation | Covered | FluentValidation on every command, in a pipeline behaviour. File size and sample caps on uploads. The webhook caps field lengths and counts. |
| 13 | Server-side authorization | Covered | Fail-closed: a fallback policy requires a signed-in user on every endpoint unless it opts out. `me/*` also requires the app scope. |
| 14 | Row-level security | Covered | Enforced in the query layer (every row filtered by runner id) and backed by foreign keys and cascade deletes. |
| 15 | Least privilege | Covered | The API's managed identity has only *Key Vault Crypto User* on one key, and SQL access via its identity. No admin passwords. |
| 16 | RBAC | Partial | One role (a signed-in runner) is all the app needs today. The scope check is in place for when more are added. |
| 33 | File upload validation | Covered | Format detected by content; FIT CRC checked; GPX/TCX read with DTDs prohibited, no external resolver, no entity expansion (XXE and billion-laughs refused, with tests); size, sample and zip-depth caps. |
| 34 | Webhook signature verification | Partial | Strava doesn't sign its webhooks, so Taperday treats an event as a hint only: it's authenticated by an unguessable secret path segment (compared in constant time, now redacted from traces), checked against our subscription and a connected athlete, and the run is then re-read from Strava with that runner's own token. A forged event can't inject data. |

## Identity and secrets

| # | Topic | Status | Where / note |
|---|---|---|---|
| 17 | Secrets management | Covered | No secrets in the repo or `appsettings`. Runtime secrets in App Service settings; Strava tokens encrypted with a Key Vault-wrapped key. The VAPID private key for reminders is an App Service setting too, and devices' push endpoints (which work as keys to push to that device) are encrypted the same way as Strava tokens, kept out of logs and redacted in traces (`PushTraces`). |
| 18 | .env in .gitignore | Covered | No `.env`; dev uses LocalDB trusted auth. gitleaks history scan is clean. |
| 19 | API key rotation | Partial | Tokens rotate on refresh. App-level secrets (Strava client secret, webhook secret) are rotated by hand; see [To do](#to-do). |
| 20 | Secret scanning | Covered | gitleaks runs in CI on every push. |
| 21–23 | Hashing / salting / bcrypt / Argon2 | N/A | Taperday stores no passwords. Sign-in is delegated to Entra External ID. |
| 24 | JWT expiry | Covered | Access tokens are short-lived and validated by `Microsoft.Identity.Web`; expiry and signature are checked on every call. |
| 25 | Refresh tokens | Covered | Handled by MSAL on the client; Strava refresh tokens rotate and are re-encrypted on use. |
| 26–27 | OAuth 2.0 / OpenID Connect | Covered | Entra External ID (auth code + PKCE) for sign-in; Strava OAuth for sync. |
| 28 | Session fixation | Covered | No server session. MSAL caches tokens in `sessionStorage`, not `localStorage`. |
| 29 | MFA | Partial | Available in the Entra External ID tenant; enabling it is a tenant setting, not code. |
| 30–31 | Brute force / account enumeration | Partial | Sign-in (email code) is handled by Entra, which has its own protections. The API's own rate limiter adds a per-IP cap. |
| 32 | Timing attacks | Covered | The webhook secret and verify token are compared in constant time (`CryptographicOperations.FixedTimeEquals`). |
| 37 | Encryption at rest | Covered | Azure SQL is encrypted at rest; Strava tokens and push endpoints and keys are additionally app-encrypted with a Key Vault-wrapped key. |
| 35 | TLS certificate expiry | Covered | Azure-managed certificates on both hosts auto-renew. HTTPS is forced. |
| 36 | HSTS | Covered | `UseHsts` in production. |

## Data and database

| # | Topic | Status | Where / note |
|---|---|---|---|
| 41 | Indexes | Covered | Indexes on every foreign key and lookup, plus the filtered unique index for one active plan per runner. |
| 46–47 | Migrations / down migrations | Covered | EF Core migrations, applied by the deploy before the new API starts. Each has a `Down`. |
| 48–50 | Transactions / ACID / isolation | Covered | `SaveChanges` is transactional; Azure SQL is ACID. |
| 52 | Optimistic locking | Covered | `rowversion` concurrency tokens on saved plans, connections and reminder devices (so two API instances never send one reminder twice). |
| 56–58 | Foreign keys / unique constraints / cascade deletes | Covered | FKs throughout; unique indexes on identity and one-active-plan; account delete cascades to plans, activities, connections and reminder devices. |
| 59 | Soft deletes | N/A | Taperday hard-deletes on request (POPIA erasure). Past plans are archived, not deleted. |
| 60 | UUIDs vs auto-increment | Covered | GUID keys, so ids aren't guessable or enumerable. |
| 70–72 | Backups / restore testing / PITR | Partial | Azure SQL keeps automated backups with point-in-time restore; the retention on the free offer is short, and a restore hasn't been rehearsed. See [To do](#to-do). |
| 42–45, 51, 53–55, 61–69, 73–74 | EXPLAIN, N+1, pooling, sharding, partitioning, VACUUM, replicas, CDC, outbox… | N/A / Covered | One small SQL database with EF connection pooling. Plan matching is scoped and bounded (no N+1 of concern). The rest (sharding, replicas, Postgres VACUUM, CDC, outbox) is for scales and engines Taperday doesn't use. |

## Reliability and operations

| # | Topic | Status | Where / note |
|---|---|---|---|
| 90 | Race conditions | Covered | Unique indexes and rowversion stop double-saves; the sync worker dedupes jobs and the activity unique index stops double-imports. |
| 115 | Webhook retries | Covered | Strava retries up to 3 times; Taperday answers 200 fast and does the work in a retried background job (1m/5m/30m/2h/12h). |
| 141–143 | Health checks / probes / graceful shutdown | Covered | `/health/live` and `/health/ready` (ready touches the DB); the host shuts down gracefully. |
| 185 | Rollbacks | Covered | Deploy keeps the old API serving until the new one is up; migrations are additive. |
| 198 | Branch protection | Partial | CI must pass before merge; direct pushes to main are discouraged by rule. Consider a required-review branch rule. |
| 201 | Cloud billing alerts | Partial | The infra is capped (free tiers, a logging quota) so it can't run up a bill, but there's no explicit budget alert. |
| 168–173 | Structured logging / tracing / correlation | Covered | OpenTelemetry traces, metrics and logs; a trace id on every error. App Insights in Azure. |
| 243 | Bot protection | Partial | Per-IP rate limiting on all traffic; no CAPTCHA (there's no anonymous write path to abuse). |
| 91–98, 107–114, 144–167, 174–197, 202–231 | Backpressure, queues, Kafka, multi-region, autoscaling, cache layers, IaC pipelines, most testing/perf topics | N/A / Partial | Taperday has no message queue, cache tier, or multi-region setup. It does have unit, integration, architecture and end-to-end (Playwright) tests, additive migrations, and a single-region free deploy. The large SRE/distributed-systems list applies at a scale Taperday isn't at. |

## Privacy and compliance

| # | Topic | Status | Where / note |
|---|---|---|---|
| 232–233 | GDPR / PII handling | Covered | Data export (profile, plans, runs, connections — never tokens) and full account delete. Consent to the privacy notice is required before anything is stored. The published policy is at `/?view=privacy`; a new notice version (`PrivacyNotice.CurrentVersion`) must be accepted before anything new is saved, uploaded or connected. |
| 234 | Audit logs | Gap | There's no dedicated, tamper-evident log of security events (sign-ins, deletes, connects). See [To do](#to-do). |
| 235 | Data residency | Covered | API and database are in South Africa North. |
| 238 | Cookie consent | N/A | Taperday sets no tracking cookies; it uses `sessionStorage` for the sign-in token only. |
| Reminders | Covered | Off unless the runner turns them on in Account, per device. Kept: the device's push address and keys (encrypted), the time, the Monday choice and the last day reminded. A reminder says only the plan's session name, built from the plan as written (not the coach's run-based adjustments), never runs, heart rate or anything from Strava, so lock screens show nothing sensitive. Turning off, the push service reporting the device gone, or deleting the account removes it; the export lists devices without their addresses. |
| Location data | Covered | GPS positions are never stored, from any source: FIT, GPX, TCX or Strava. They're used only to measure distance, then discarded. |
| Heart rate | Covered | Health information (POPIA special personal information), so kept only with its own, optional consent (`Runner.HeartRateConsent`). Without it every reading is dropped before a run is recorded, from any source, and anything held from before is hidden; withdrawing deletes what's stored. No medical claims. |
| 240–241 | SPF/DKIM/DMARC, bounce handling | N/A | No outbound email yet (the weekly email is "coming soon"). Revisit when it ships. |

## AI

| # | Topic | Status | Where / note |
|---|---|---|---|
| 244 | Prompt injection | N/A | Taperday runs no LLM and sends nothing to one. Plans and run analysis are deterministic code. |
| 245–250 | Hallucinated packages, context windows, evals, model pinning… | N/A | No AI in the product. (If AI plan-adaptation is ever added, note that Strava's terms forbid AI use of Strava data.) |

## To do

Small, specific follow-ups, none urgent:

1. **Rotate the Strava client secret.** It was exposed in a chat transcript. Reset it on strava.com/settings/api and update `Strava__ClientSecret` in App Service.
2. **Rehearse a database restore** from Azure SQL's point-in-time backup, and check the free offer's retention is enough (raise the tier if not).
3. **Add an audit log** of security-relevant events (sign-up, account delete, Strava connect/disconnect), write-only, for incident response.
4. **A required-review branch rule** on `main`, and a billing budget alert on the resource group, for belt and braces.
5. **Confirm MFA** is on (or deliberately off) in the Entra External ID tenant.

## Verified by

A code-level security review (Oct 2026) covering auth, IDOR, the webhook, token and OAuth-state handling, the file
parsers, injection, secrets, web hardening, dependencies and privacy. No critical or high findings. The low/medium
items it raised are fixed or listed above.
