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

Every push to `main` deploys itself once CI passes (`.github/workflows/deploy.yml`): it builds the API and the
website, applies any new migrations, deploys the API, deploys the website, then waits for `/health/ready`. It can also
be run by hand: Actions → deploy → Run workflow.

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

## Going live

Redeploy with `-p apiSku=B1 databaseTier=basic`. Changing the database tier moves the data with it; the free
offer can't be switched back on for the same database afterwards.

## Why things are set up this way

- **No passwords anywhere.** The database only accepts Entra sign-ins; the API uses its managed identity.
- **Health probes use `/health/live`**, which never touches the database. Probing `/health/ready` every minute
  would stop the free database from ever pausing and use up its monthly allowance in about two days.
- **`ASPNETCORE_FORWARDEDHEADERS_ENABLED=true`**: App Service's front end forwards each runner's real IP, so rate
  limits apply per runner instead of to everyone at once.
