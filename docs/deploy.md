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

## Deploying the code

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
VITE_API_BASE_URL=<apiUrl> VITE_AUTH_CLIENT_ID=<web-client-id> VITE_AUTH_AUTHORITY=https://<subdomain>.ciamlogin.com/<tenant-id>/ VITE_AUTH_SCOPE=api://<api-client-id>/Plans.ReadWrite npm run build
export SWA_CLI_DEPLOYMENT_TOKEN=$(az staticwebapp secrets list -n <webName> -g rg-taperday --query properties.apiKey -o tsv)
npx @azure/static-web-apps-cli deploy ./dist --env production
```

`client/public/staticwebapp.config.json` sets the website's security headers. Its Content-Security-Policy names
the API and sign-in hosts; **update it when either changes** (for example when taperday.run goes live), or the
site will load but sign-in and saving will silently fail.

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
