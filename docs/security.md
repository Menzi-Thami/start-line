# Security

Start Line is a public, anonymous, stateless API. It stores nothing and holds no user data, which
removes whole classes of risk (account takeover, data leaks, row-level access bugs) until accounts
arrive. What's left is abuse: scraping, flooding and malformed input.

## In place

| Control | Where | Proved by |
|---|---|---|
| Rate limiting per client IP: global token bucket, plus 30 plans/min on plan generation, 429 + `Retry-After` | `PresentationDependencyInjection.AddRateLimiter` | `RateLimitTests` |
| Real client IP taken from `X-Forwarded-For` **only** from configured proxies, so the header can't be forged to dodge limits | `ForwardedHeaders` options + `UseForwardedHeaders()` first in the pipeline | `HardeningTests` (both directions, mutation-checked) |
| 16 KB request body cap (Kestrel + per-endpoint) and bounded list inputs | `Program.cs`, `PlansController`, `GeneratePlanValidator` | `HardeningTests` |
| Strict validation before any work, with ProblemDetails and stable error codes; no stack traces in responses | `ValidationBehaviour`, `ProblemDetailsExceptionHandler` | `ApiTests`, `DispatcherPipelineTests` |
| Security headers: `nosniff`, `X-Frame-Options: DENY`, `default-src 'none'` CSP, no referrer, permissions policy; HSTS outside development | `SecurityHeadersMiddleware`, `Program.cs` | `ApiTests` |
| CORS allow-list (GET/POST, `Content-Type` only); empty by default | `Cors:AllowedOrigins` | |
| OpenAPI and Scalar only in development | `Program.cs` | |
| No secrets in the repo, and none needed to run | | gitleaks in CI, secret sweep |
| Vulnerable-package gate: NuGet audit fails the build, including transitive packages; Dependabot weekly | `Directory.Build.props`, `.github/dependabot.yml` | CI |
| Trace id on every response (`X-Trace-Id`) to match reports to logs | `TraceIdMiddleware` | `HardeningTests` |

## Set these when deploying

1. **`ForwardedHeaders:KnownProxies` / `KnownNetworks`** for your proxy or gateway. Without them,
   every user behind the proxy shares one rate-limit bucket. On Azure App Service, which fronts every
   app with its own proxy, set the app setting `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` instead.
2. **`AllowedHosts`** to the real host name (it is `*` for local development).
3. **`Cors:AllowedOrigins`** to the frontend's origin, if it's served from a different host.
4. **A WAF or edge rate limiting** (Azure Front Door, Cloudflare). The in-app limiter is per instance
   and isn't DDoS protection.
5. **`OTEL_EXPORTER_OTLP_ENDPOINT`** if you want traces exported. Use the platform's managed identity
   or secret store for any exporter credentials, never appsettings.

## Not applicable yet, and when it will be

- **Authentication and authorisation.** The plan builder is deliberately open. When accounts arrive,
  use Entra External ID with a fallback policy that requires authentication, and keep the builder
  itself anonymous.
- **Row-level data isolation.** There is no database. When saved plans or Strava data arrive, every
  query is scoped to the signed-in user from the token (never from the request body), with tests
  proving one user can't read another's rows.
- **Idempotency keys.** No endpoint has side effects.
