# Setting up sign-in (Microsoft Entra External ID)

Taperday signs runners in with **your own personal External ID tenant**. Use your personal Microsoft
account and a personal Azure subscription: never a work tenant, and never an employer's sandbox.

Until this is done, accounts are simply off: the plan builder works as normal, and the "My plans" API
answers 401. Nothing else needs to change.

Portal labels move around; if a step's wording doesn't match, the Microsoft Learn page
"Create an external tenant" has the current screens.

## 1. Create the external tenant

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com) with your **personal** account.
   If you don't have an Azure subscription yet, create a free one first.
2. Create an **external tenant** (Entra ID → Overview → Manage tenants → Create → External).
3. Pick a subdomain, e.g. `taperday`. Your sign-in authority becomes
   `https://taperday.ciamlogin.com/<tenant-id>/` (the tenant ID in the path matters, see step 5).
4. Note the tenant's **Directory (tenant) ID**.

> Don't sign up as a runner using the same email you administer the tenant with. External ID creates a
> second, customer-level user with that email, and signing in to the admin centre can then land you in
> the wrong account. Use a different email for testing (an alias works).

## 2. Register the API

In the external tenant: App registrations → New registration, name **Taperday API**.

1. **Expose an API** → set the Application ID URI (accept the default `api://<api-client-id>`).
2. **Add a scope** named `Plans.ReadWrite` (who can consent: admins and users).
3. **Manifest** → set `accessTokenAcceptedVersion` to `2`. Without this the API rejects every token
   with an `IDX20804` metadata error.
4. **Token configuration** → add the optional claim **email** to the *access* token, so weekly
   emails know where to go.
5. Note the API's **Application (client) ID**.

## 3. Register the web app

New registration, name **Taperday Web**.

1. Platform: **Single-page application**, redirect URIs `http://localhost:5173` and the website's production URL.
2. **API permissions** → add *Taperday API* → `Plans.ReadWrite`, plus Microsoft Graph `openid` and
   `offline_access` → grant admin consent, so runners never see a permissions prompt.
3. Note the web app's **Application (client) ID**.

## 4. Sign-up and sign-in flow

1. External Identities → **User flows** → New → "Sign up and sign in".
2. Sign-in methods: **Email one-time passcode** (no passwords to leak). Add Google later if wanted.
3. Attributes to collect: **Display name**.
4. In the flow's **Applications**, add *Taperday Web*.

## 5. Point the app at it

API (user-secrets: these values identify your tenant, so they stay out of the repo):

```bash
cd src/StartLine.API
dotnet user-secrets set "AzureAd:Instance" "https://<subdomain>.ciamlogin.com/"
dotnet user-secrets set "AzureAd:TenantId" "<tenant-id>"
dotnet user-secrets set "AzureAd:ClientId" "<api-client-id>"
```

Client (`client/.env.local`, git-ignored):

```bash
VITE_AUTH_CLIENT_ID=<web-client-id>
VITE_AUTH_AUTHORITY=https://<subdomain>.ciamlogin.com/<tenant-id>/
VITE_AUTH_SCOPE=api://<api-client-id>/Plans.ReadWrite
```

> **The client authority must end in the tenant ID**, not `<subdomain>.onmicrosoft.com` and not a bare host.
> External ID issues tokens as `https://<tenant-id>.ciamlogin.com/<tenant-id>/v2.0`, and MSAL 5 checks the issuer
> against the tenant named in the authority's path. Any other form fails before the sign-in page opens, with
> `endpoints_resolution_error` in the console and no visible error. The API's `AzureAd:Instance` stays the bare
> `https://<subdomain>.ciamlogin.com/`: Microsoft.Identity.Web adds the tenant ID itself.

## Database

Locally the API uses LocalDB and migrates itself on start in Development. In Azure, use Azure SQL (the
free offer is enough) with the connection string in App Service configuration or Key Vault, never in
appsettings, and apply migrations from the deploy pipeline:

```bash
dotnet ef migrations bundle --project src/StartLine.Infrastructure --startup-project src/StartLine.Infrastructure
```

## Privacy (POPIA)

- Runners must accept the privacy notice to sign up; the version and time are stored.
- `GET /api/v1/me/export` returns everything stored about the runner.
- `DELETE /api/v1/me` deletes the runner and every plan. Their sign-in itself lives in External ID: delete
  the user there too if they ask for full erasure.
- When illness tracking arrives, store only "unwell from/to", never symptoms.
