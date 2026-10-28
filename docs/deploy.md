# Deploying Taperday to Azure

Everything lives in one resource group, described by `infra/main.bicep`. Pre-launch it costs nothing.

| Resource | Pre-launch | At launch |
|---|---|---|
| Website | Static Web Apps, Free | same |
| API | App Service F1, free (sleeps when idle) | `apiSku=B1`, about $13/month |
| Database | Azure SQL free offer, auto-pauses, **cannot bill** | `databaseTier=basic`, about $5/month |
| Logs | Log Analytics capped at 0.15 GB/day, inside the free 5 GB/month | same |

## Keep this away from work accounts

This laptop's Azure CLI is signed in to Kocho, with a client subscription as its default. **Always** use the
separate Taperday profile, and check the subscription before any command that changes anything:

```bash
export AZURE_CONFIG_DIR="$USERPROFILE/.azure-startline"
az account show --query "{name:name, user:user.name, tenant:tenantId}"
```

## Before the first deployment

1. **Budget alert** (portal): Cost Management + Billing → Budgets → Add. Set a small monthly amount in your
   billing currency (about $5 or R100) with an email alert at 50% and 100%. Pay-as-you-go has no spending limit.
2. **Resource providers** (free, one-off):
   ```bash
   for p in Microsoft.Web Microsoft.Sql Microsoft.OperationalInsights Microsoft.Insights; do az provider register -n $p; done
   ```
3. **Bicep CLI**: `az bicep install`.

## Deploy

```bash
az group create -n rg-taperday -l southafricanorth
az deployment group create -g rg-taperday -f infra/main.bicep \
  -p sqlAdminLogin="$(az ad signed-in-user show --query userPrincipalName -o tsv)" \
     sqlAdminObjectId="$(az ad signed-in-user show --query id -o tsv)"
```

Add the External ID values once sign-in is set up (see `docs/accounts-setup.md`):
`externalIdInstance=https://<subdomain>.ciamlogin.com/ externalIdTenantId=<id> externalIdApiClientId=<id>`.

## After the first deployment: database

Your laptop can't reach the database until you let its IP through the firewall. Do that only for the job, then
remove it again. Connecting the first time also wakes the paused database, which takes up to a minute.

```bash
az sql server firewall-rule create -g rg-taperday -s <sqlServerName> -n temp-setup --start-ip-address <your-ip> --end-ip-address <your-ip>
# ...run the two SQL files below...
az sql server firewall-rule delete -g rg-taperday -s <sqlServerName> -n temp-setup
```

The SQL error message (40615) names the IP the server sees, which is the one to allow.

1. **Create the tables.** Generate the migrations as one SQL script and review it before it runs:
   ```bash
   dotnet ef migrations script --idempotent --project src/StartLine.Infrastructure      --startup-project src/StartLine.Infrastructure -o migrate.sql
   ```
2. **Give the API access**: `infra/grant-api-database-access.sql`, with `API_NAME` replaced by the `apiName` output.

Run both as yourself (the database's Entra admin) with a token from the Taperday CLI profile, for example
`az account get-access-token --resource https://database.windows.net/` passed to `SqlConnection.AccessToken`.

> Don't use `Authentication=Active Directory Default` on a laptop that also has a work account. It tries Visual
> Studio's signed-in account before the Azure CLI, so it can sign in to the database as the wrong person (or fail
> in a confusing way). An explicit token from the right CLI profile can't.

Both files are safe to run again.

## Automatic deploys

Every change is checked in full **before it's merged**, on the developer's machine: `scripts/check.sh` from the repo
root runs the backend format, build, all .NET tests (LocalDB) and the migrations check, then the client's lint,
typecheck, tests, build and audit, then the Playwright end-to-end suite. GitHub Actions doesn't repeat that on pull
requests: the private repo's free 2,000 Actions minutes a month ran out on 25 Oct 2026, so they're kept for deploys.
`ci.yml` still exists to run by hand (Actions → ci → Run workflow); `secret-scan` still runs on every pull request
and on `main`.

Every push to `main` then deploys itself (`.github/workflows/deploy.yml`, about 4 minutes): it builds the API and the
website (any build error or warning stops it before production is touched), applies any new migrations, deploys the
API, deploys the website, then waits for `/health/ready`. It can also be run by hand: Actions → deploy → Run workflow.

How it signs in, with no password stored anywhere:

- GitHub's `production` environment holds the settings as variables (app names, client IDs, the VITE_* values) plus
  one secret, the Static Web Apps deployment token.
- An app registration in your Azure tenant, **Taperday GitHub deploy**, trusts GitHub's OIDC tokens only for
  `repo:Menzi-Thami@43884343/start-line@1410876756:environment:production` (GitHub now puts the owner and repo
  IDs in the subject, so a deleted-and-recreated repo with the same name can't inherit the trust), and the
  environment only accepts runs from `main`.
- It holds **Website Contributor on the API app only**: it can't touch the database server, the resource group or
  anything else in the subscription.
- In the database it is a user with `db_ddladmin` (to run migrations) plus read/write. The API itself still only
  has read/write.

Migrations run before the new API starts, so **keep them additive** (add columns and tables; drop old ones in a
later release, once nothing reads them).

If a setting changes (for example a new domain), update the environment's variables in GitHub (Settings →
Environments → production) and the CSP in `client/public/staticwebapp.config.json`.

## Investigating a failed deploy

Open **Actions → deploy → latest failed run**, expand the red step, and copy its name and error message.
Check the commit shown on the run: rerunning an old run uses its old workflow, even after a fix has merged.
Use **Run workflow → main** to test the current workflow after resolving the cause.

| Failure | What to check |
|---|---|
| Job never starts; billing or minutes message | Repository owner's Actions usage and spending limit. This repository previously exhausted its included minutes. |
| Install .NET | Exact SDK download error. The current workflow uses Microsoft's current install script and an exact version to avoid the old storage URL. |
| Build API / Build website | First compiler or dependency error. Reproduce with `dotnet publish src/StartLine.API -c Release` or `cd client && npm ci && npm run build`. |
| Azure login | The `production` environment's Azure IDs and the app registration's federated credential subject described above. |
| Migrate database | SQL error code: 40613 means waking; 40615 means firewall; authentication or permission errors need the deploy identity's database access checked. |
| Database reports free monthly allowance exhausted | Wait for the portal's displayed allowance reset or explicitly choose a paid database tier. Retries and workflow changes cannot replenish the allowance. |
| Deploy API / Deploy website | Azure role assignment, correct app name, or the Static Web Apps deployment token, according to the error. |
| Smoke test | API startup/application logs and database connectivity; a successful upload alone does not establish a healthy API. |

A cloud coding environment reporting `api.github.com: Forbidden` is a separate network-access problem:
allow `api.github.com` in that environment's network settings, then save and publish the configuration.
It prevents reading Actions logs and opening PRs through the API; it does not explain a deploy failing on a GitHub runner.
Share the run URL and failed-step error, never deployment tokens or connection strings.

The 28 October 07:51 UTC website-build failure (`TS2769`, `Home.test.tsx`, unsupported `exact` in
`ByRoleOptions`) was fixed in commit `49f4882`, now merged into `main`. It was a TypeScript query-options
error, not an Azure database error. Build the latest `main` rather than rerunning that historical run.

The free database intentionally uses `freeLimitExhaustionBehavior: AutoPause` in `infra/main.bicep`.
In Azure Portal → SQL databases → the Taperday database, check the free-offer usage and reset date.
When the allowance is exhausted, account storage and migrations cannot work until service resumes.
Keep this setting to stay within the free offer; opting into continued use or switching to a paid tier is a billing
decision. Do not repeatedly deploy to try to wake a database that has exhausted its monthly allowance.
Once SQL is available again, run the current `main` deploy and check both migration success and `/health/ready`.

## Deploying the code by hand

Only needed if the workflow is broken.

**API**: publish, zip, upload. (Use Windows' `tar`, not PowerShell's `Compress-Archive`, whose zips Linux unpacks badly.)

```bash
dotnet publish src/StartLine.API -c Release -o publish
(cd publish && tar -a -c -f ../api.zip *)
az webapp deploy -g rg-taperday -n <apiName> --src-path api.zip --type zip --restart true
```

The first request after a deploy (or after the free tier sleeps) takes 30 to 40 seconds.

**Website**: the sign-in settings are baked in at build time, so build with the production values and upload
with the Static Web Apps CLI. The deployment token is a secret: pass it through the environment, never print it.

```bash
cd client
VITE_SITE_URL=<webUrl> VITE_API_BASE_URL=<apiUrl> VITE_AUTH_CLIENT_ID=<web-client-id> VITE_AUTH_AUTHORITY=https://<subdomain>.ciamlogin.com/<tenant-id>/ VITE_AUTH_SCOPE=api://<api-client-id>/Plans.ReadWrite npm run build
export SWA_CLI_DEPLOYMENT_TOKEN=$(az staticwebapp secrets list -n <webName> -g rg-taperday --query properties.apiKey -o tsv)
npx @azure/static-web-apps-cli deploy ./dist --env production
```

`client/public/staticwebapp.config.json` sets the website's security headers. Its Content-Security-Policy names
the API and sign-in hosts; **update it when either changes** (for example when taperday.run goes live), or the
site will load but sign-in and saving will silently fail.

`VITE_SITE_URL` is the address link previews (Open Graph and Twitter cards) use for their image. It defaults to
https://taperday.run, which is live (registered at Spaceship, 20 Oct 2026), so it needn't be set. The image itself
is `client/public/og-image.png` (1200 x 630). The CSP needs no change for it: crawlers fetch it directly.

### Checking it worked

- `<apiUrl>/health/ready` says `Healthy` (the API reached the database with its managed identity).
- `<apiUrl>/api/v1/me` answers 401 with `WWW-Authenticate: Bearer` (real sign-in is switched on).
- On the website, **Sign in** opens the Taperday sign-in page. If nothing happens, check the browser console
  for `endpoints_resolution_error`: the authority is missing the tenant ID (see `docs/accounts-setup.md`).

## Keeping the free API awake

On F1, Azure unloads the API after about 20 minutes without a request, and F1 has no Always On. Until launch, an
outside uptime monitor keeps it loaded for free:

- Point it at `<apiUrl>/health/live` every 5 minutes, for example on UptimeRobot's free plan (check its terms).
- **`/health/live`, never `/health/ready`.** `live` runs no checks and never touches the database (`Program.cs`),
  so the pings cost almost no CPU: a second or two a day of F1's 60 CPU minutes. `ready` queries the database, and
  keeping the database awake would use up the free offer's 100,000 vCore-seconds in two or three days, after which it
  stays paused until the next month.
- The ping must come from outside Azure. A timer inside the API can't wake it: once F1 unloads the API, nothing in
  it runs.
- **Not from a scheduled GitHub Action.** Every run bills at least a minute, so a ping every 5 minutes is about 8,600
  minutes a month, well over a private repo's 2,000 free ones.

The database still pauses after an hour with no queries (`autoPauseDelay: 60`) and took 47 s to resume when measured
(23 Oct 2026). Building and sharing plans never touch it. A signed-in runner who arrives after a quiet hour sees the
waiting screen (`SignInWait`), which follows the wake through `live` then `ready` and keeps trying for up to 2½
minutes (`WAKE_PATIENCE_MS`).

## Reminders (Web Push)

Runners can turn on a reminder of the day's run (and a Monday "new week" nudge) in Account. It's off until a VAPID key
pair is set; without one, Account doesn't offer it and nothing is ever sent. Web Push itself is free: the browsers'
push services (Google, Apple, Mozilla, Microsoft) carry the messages at no charge.

1. **Make a key pair, on your laptop.** Never commit it, paste it in a chat, or put it in `appsettings`:
   ```bash
   npx web-push generate-vapid-keys --json
   ```
   It prints `publicKey` (65 bytes, base64url) and `privateKey` (32 bytes, base64url).
2. **Set them in the API's App Service settings** (Taperday CLI profile, as above). Put the values in shell variables
   first, so they aren't typed into the command itself:
   ```bash
   az webapp config appsettings set -g rg-taperday -n <apiName> --settings \
     Push__PublicKey="$VAPID_PUBLIC" Push__PrivateKey="$VAPID_PRIVATE" Push__Subject="mailto:<contact email>"
   ```
   `Push__Subject` is how a push service can reach you about Taperday's pushes (a `mailto:` or `https:` address). The
   API checks all three at start and won't start with a malformed key.
3. **Data Protection must be wrapped by Key Vault** (`DataProtection__KeyVaultKeyUri`, already set for Strava): devices'
   push addresses are encrypted with the same key ring as Strava tokens, under their own purpose.

**What reminders say.** The day's run with its distance and pace range in the runner's units, then the plan's own words for
it; race day with the goal pace; and, for runners who tick it, a Monday note: the week number and phase, last week's
check-ins, this week's distance, key sessions and long run, and today's run. `Push__IncludeRunData=true` adds what comes
from runs: the coach's call (made on Monday morning if the runner hasn't opened the plan yet, so the plan page then shows
the same one), the plan as the coach has it, and last week's distance run. It's **off** until Strava confirms that
pushing a runner their own synced data to their own device is fine (`docs/strava-sync.md`).

Keep the key pair for good. A browser subscribes with the public key, so a new pair stops every existing device, and
each runner would have to turn reminders off and on again.

**Timing on the free plan.** A background worker sleeps until the next reminder is due. On F1 that only works while
the API is loaded, which is what the uptime ping on `/health/live` (above) is for. If the API slept anyway, reminders
still due that day go out as soon as it starts again (late, never twice); a day it slept through entirely is skipped.

**Database cost.** The worker never polls. It reads the database when the API starts, when a reminder is due, and when
a runner changes a plan, a time zone or a device, so the free database can still pause. Each wake keeps the database up
for its 60-minute pause delay: about 1,800 vCore-seconds at 0.5 vCore, under 2% of the monthly 100,000. Reminders at
the same time share a wake, and days with nothing in a runner's plan don't wake it. With a handful of runners who
mostly open Taperday after their reminder anyway, that's well inside the allowance; if many runners pick many
different times, watch the database's usage.

## Going live

Redeploy with `-p apiSku=B1 databaseTier=basic`. Changing the database tier moves the data with it; the free
offer can't be switched back on for the same database afterwards.

## Why things are set up this way

- **No passwords anywhere.** The database only accepts Entra sign-ins; the API uses its managed identity.
- **Health probes use `/health/live`**, which never touches the database. Probing `/health/ready` every minute
  would stop the free database from ever pausing and use up its monthly allowance in about two days.
- **`ASPNETCORE_FORWARDEDHEADERS_ENABLED=true`**: App Service's front end forwards each runner's real IP, so rate
  limits apply per runner instead of to everyone at once.
