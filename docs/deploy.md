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

## After the first deployment

1. Give the API access to the database: run `infra/grant-api-database-access.sql` as yourself (the database's
   Entra admin), replacing `API_NAME` with the `apiName` output.
2. Apply migrations:
   ```bash
   dotnet ef database update --project src/StartLine.Infrastructure --startup-project src/StartLine.Infrastructure \
     --connection "Server=tcp:<sqlServerHost>,1433;Database=sqldb-taperday;Authentication=Active Directory Default;Encrypt=True;"
   ```

## Going live

Redeploy with `-p apiSku=B1 databaseTier=basic`. Changing the database tier moves the data with it; the free
offer can't be switched back on for the same database afterwards.

## Why things are set up this way

- **No passwords anywhere.** The database only accepts Entra sign-ins; the API uses its managed identity.
- **Health probes use `/health/live`**, which never touches the database. Probing `/health/ready` every minute
  would stop the free database from ever pausing and use up its monthly allowance in about two days.
- **`ASPNETCORE_FORWARDEDHEADERS_ENABLED=true`**: App Service's front end forwards each runner's real IP, so rate
  limits apply per runner instead of to everyone at once.
