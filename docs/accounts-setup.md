# Setting up sign-in (Microsoft Entra External ID)

Taperday signs runners in with **your own personal External ID tenant**. Use your personal Microsoft
account and a personal Azure subscription: never a work tenant, and never an employer's sandbox.

A production build without identity settings fails closed; it never opens private training. Only the explicit local/E2E mode supports the anonymous builder. Runner-owned API routes require authentication.

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

1. Platform: **Single-page application**, redirect URIs for the production website only (`https://taperday.run`,
   `https://www.taperday.run` and the Static Web App's own production host). Staging uses its own **Taperday Web
   (staging)** registration with the staging site's URL and `http://localhost:5173` for local development, so a staging
   or local build can't send production sign-ins back to itself.
2. **API permissions** → add *Taperday API* → `Plans.ReadWrite`, plus Microsoft Graph `openid` and
   `offline_access` → grant admin consent, so runners never see a permissions prompt.
3. Note the web app's **Application (client) ID**.

## 4. Sign-up and sign-in flow

1. External Identities → **User flows** → New → "Sign up and sign in".
2. Sign-in methods: **Email one-time passcode** (no passwords to leak). Add Google with step 4a.
3. Attributes to collect: **Display name**.
4. In the flow's **Applications**, add *Taperday Web*.

## 4a. Sign in with Google (optional, recommended)

Google lets runners in with no emailed code, so it keeps working when Microsoft's code email is slow or lost. Until all
three parts below are done, leave `VITE_AUTH_GOOGLE` unset: the app then hides its Google button, which would otherwise
fail. Microsoft's page: "Add Google as an identity provider" (External ID, external tenants).

**1. Google Cloud console** (signed in with the Google account that should own this; a personal one, as for the tenant):

1. New project, e.g. *Taperday sign-in*, and open it.
2. APIs & services → **OAuth consent screen** → User type **External**. App name **Taperday**, a support email, and
   under **Authorized domains** add `ciamlogin.com` and `microsoftonline.com`. Save.
3. **Credentials** → Create credentials → **OAuth client ID** → **Web application**, name *Microsoft Entra External ID*.
   Under **Authorized redirect URIs** add all seven (`<tenant-id>` is the Directory ID, `<subdomain>` is `taperday`):

   ```text
   https://login.microsoftonline.com
   https://login.microsoftonline.com/te/<tenant-id>/oauth2/authresp
   https://login.microsoftonline.com/te/<subdomain>.onmicrosoft.com/oauth2/authresp
   https://<tenant-id>.ciamlogin.com/<tenant-id>/federation/oidc/accounts.google.com
   https://<tenant-id>.ciamlogin.com/<subdomain>.onmicrosoft.com/federation/oidc/accounts.google.com
   https://<subdomain>.ciamlogin.com/<tenant-id>/federation/oauth2
   https://<subdomain>.ciamlogin.com/<subdomain>.onmicrosoft.com/federation/oauth2
   ```

4. Create, then copy the **Client ID** and **Client secret** straight into step 2. Don't save the secret anywhere else,
   and never in this repo or a chat.
5. Publish the consent screen (Audience → **Publish app**), or only the test users you list can sign in.

**2. Entra admin center** (the external tenant):

1. External Identities → **All identity providers** → Built-in → **Google** → Configure. Name *Google*, paste the
   client ID and secret, Save.
2. External Identities → **User flows** → your sign-up and sign-in flow → **Identity providers** → tick **Google**, Save.
   Microsoft's own sign-in page now shows a Google button too.

**3. Test it before runners see it** (a private window on the staging site, or locally):

1. A Google account that has never used Taperday: it should sign up and land on "finish your account".
2. A Google account whose address **already has an email-code account**. External ID doesn't link the two by email, so
   expect Microsoft to send it back to the email code, or a second, empty Taperday account (runners are found by the
   Microsoft user ID, not the email). Note which happens; if it's the second, existing runners keep signing in by email.

**4. Switch the app's button on:** GitHub → Settings → Environments → `staging` (and later `production`) → Variables →
`VITE_AUTH_GOOGLE` = `true`, then deploy. Locally, add `VITE_AUTH_GOOGLE=true` to `client/.env.local`.

## 4b. Email and password instead of an emailed code

Runners find a saved password (filled by Face ID or a fingerprint) quicker than fetching a code. A web app belongs to
one user flow, so the switch is per environment:

1. Create a second "Sign up and sign in" flow with **Email with password** and Google, collecting the same attributes
   (email, display name) as the code flow.
2. Move the environment's web app to it (the flow's Applications), staging first. To undo, move it back.
3. Only after verifying the staging flow with a disposable new customer, set `VITE_AUTH_PASSWORDS=true` for staging.
   This changes explanatory copy only; it cannot change a Microsoft credential challenge.

**Existing OTP-only customers retain their original sign-in method.** Changing the flow affects new customers;
it does not prove an old customer can add a password through Forgot password. SSPR resets an existing password;
OTP used as password-reset proof or MFA is distinct from primary email-code sign-in. Do not promise conversion.
Preserve Entra `oid`, `Runner.IdentitySubject`, runner ID, plans, runs, offline drafts and Strava linkage. Never
recreate accounts or link by matching email. Any migration requires a Microsoft-supported path demonstrated on
disposable identities, identity/data checks and separate owner approval before credential changes.

Microsoft sources: [existing-user behaviour](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers#update-sign-in-methods),
[password reset](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-enable-password-reset-customers).

Password-manager AutoFill may be unlocked by the OS using biometrics or a device PIN; Taperday never stores passwords.
This is different from FIDO2 passkey sign-in. External ID passkeys must be assessed for eligible password-backed local
customers, MFA/enrolment, delegated credential-management permissions, provider and actual device support. Existing
OTP-only/social customers must not be promised eligibility. No passkey credential UI or tenant-policy change is enabled
by this PR. [Microsoft passkey documentation](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-sign-in-with-passkey).

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
# VITE_AUTH_GOOGLE=true   # only after step 4a
# VITE_AUTH_PASSWORDS=true   # only when this web app is on the email-and-password flow (step 4b)
```

Every sign-in button lets the runner choose the account: the app asks Microsoft with `prompt=select_account` and
forgets the device's remembered account first, so Microsoft's page never locks in the last email used on that device
(`client/src/app/sign-in-requests.ts`).

> **The client authority must end in the tenant ID**, not `<subdomain>.onmicrosoft.com` and not a bare host.
> External ID issues tokens as `https://<tenant-id>.ciamlogin.com/<tenant-id>/v2.0`, and MSAL 5 checks the issuer
> against the tenant named in the authority's path. Any other form fails before the sign-in page opens, with
> `endpoints_resolution_error` in the console and no visible error. The API's `AzureAd:Instance` stays the bare
> `https://<subdomain>.ciamlogin.com/`: Microsoft.Identity.Web adds the tenant ID itself.

## 6. Keep runners signed in, and protect the admins (Conditional Access)

A new external tenant comes with **security defaults** switched on. They can't be tuned, and no Conditional Access
policy can be switched on while they are, so Taperday uses two policies (Entra ID → Conditional Access →
Policies). Confirm the current tenant's feature availability and licensing before changing these settings.

**Checked live on 24 November 2026** (read-only Graph check, signed in as the CLI account). An earlier check that day
found the runner-session policy excluded only Global Administrator and Organizational Branding Administrator; the
owner has since added the seven CLI roles. Both policies are **On** and target the same nine roles: the MFA policy
includes them (excluding only the emergency access account) and the runner-session policy excludes them. The CLI
account holds exactly the seven roles in section 8, and its sign-ins that day show multifactor authentication was
required and Conditional Access succeeded. Recheck after any role or policy change.

| Policy | Applies to | Does |
|---|---|---|
| Taperday: keep runners signed in | All users, except Global Administrator, Organizational Branding Administrator and every role currently assigned to the CLI account (the seven recorded roles are in section 8) | All resources. Session → Persistent browser session → **Always persistent**. |
| Taperday: require MFA for admins | Global Administrator, Organizational Branding Administrator and the seven roles of the CLI admin account (section 8), except the emergency access account (section 7) | All resources. Grant → **Require multifactor authentication**. |

Why the first one: Microsoft's [SPA refresh tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens#token-lifetime)
expire after 24 hours; that is not the lifetime of an API access token or a promise that a runner stays signed in.
Taperday tries to recover the session with Microsoft (`client/src/app/AuthProvider.tsx`). A persistent browser session
can help after a browser restart, but revocation, other policies and browser/PWA restrictions can still require an
interactive return. **Always persistent** applies to users targeted by the policy and suppresses the "Stay signed in?"
prompt. Verify the actual provider and installed-device behaviour under PR #315.

For an owner-approved initial setup or repair, order matters:

1. Create both policies with **Enable policy: Off**.
2. Turn off security defaults: Entra ID → Overview → Properties → Manage security defaults → Disabled → Save.
3. Turn the MFA policy **On** first, then the session policy, and **Save** each one.
4. Keep that admin tab open and check you can still sign in from a private window before closing it. If you can't,
   turn the MFA policy off from the open tab.

For any later change, such as a new admin role, propose the exact difference to the existing policies first; do not
recreate them or repeat the initial setup. Preserve existing targets, emergency-account exclusions and controls. An owner with
the appropriate policy-administration role must approve and apply any change. Verify both policies are **On** (not
Off or Report-only), the CLI account is covered by admin MFA and excluded from runner persistence, and a fresh private
CLI sign-in satisfies the policy in the sign-in logs. Record the date and sanitized outcome; a document or green CI
cannot establish that the tenant policy was changed. Directory-role targeting supports tenant-wide built-in roles;
review user/group targeting separately if assignments are object-scoped or administrative-unit-scoped
([Microsoft's assignment rules](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-users-groups)).

Security defaults also blocked legacy protocols such as IMAP and POP. Taperday uses none of them, and external tenants
can't target them in Conditional Access, so nothing replaces that part.

## 7. Emergency access (break-glass) account

A second Global Administrator, so a lost personal account or a broken policy can't lock you out of the tenant.

- **A cloud-only account created in the tenant** (`<name>@<subdomain>.onmicrosoft.com`), not a personal Microsoft
  account. Its exact name lives in your password manager, not in this public repo.
- **Global Administrator, used for nothing else.** It's excluded from "Taperday: require MFA for admins" and from
  nothing else, so a mistake in that policy can't lock out both admins. Microsoft still requires MFA to sign in to its
  admin portals, so it needs a passkey.
- **Setting it up:** Users → the account → **Reset password**. The temporary password shows only on your screen. Sign in
  to entra.microsoft.com in a private window, change it to a long random password from your password manager, and
  register a passkey (a security key, or a passkey saved in your password manager). Note in the password manager where
  the passkey is.
- **Use it only when your normal admin account can't get in.** Check its sign-ins now and then (Entra ID → Monitoring →
  Sign-in logs, filtered to the account). Alerts on its sign-ins would need Log Analytics, which costs money, so there
  are none.
- **Test it twice a year:** sign in, confirm the passkey works, sign out.

The personal Microsoft account behind your normal admin also owns the Azure subscription that hosts Taperday, in its own
tenant. Keep that account's recovery phone, alternate email and recovery code current. An extra Owner on the
subscription, created the same way in that tenant, would cover the hosting side too.

## 8. CLI admin account (scripted changes to the tenant)

The normal admin is a personal Microsoft account added to the tenant as a guest. The earlier CLI attempt with that
account failed with AADSTS500208. That observation is specific to the account, tenant and client configuration; it does
not establish that all personal guest accounts are unsupported by Azure CLI. A separate member account was recorded
as created in this tenant on 24 November 2026 for administrative scripts and checks. Its assignments and policy
coverage were checked live the same day (section 6).

- **A member account created in the tenant** (`<name>@<subdomain>.onmicrosoft.com`). Its name lives in your password
  manager, not in this public repo.
- **Recorded roles, not a default bundle to grant.** Review which roles the approved task actually needs. Prefer a
  read-only identity for audits; remove unused write access through a separately approved change. On 24 November
  2026 the account held exactly these seven direct assignments:

  | Role | Used for |
  |---|---|
  | Global Reader | Reading supported settings for checks and audits; role and Graph permission limits still apply |
  | Application Administrator | App registrations and credentials, redirect URIs, scopes and supported consent grants; does not grant Microsoft Graph application permissions |
  | External ID User Flow Administrator | User flows: attached apps, sign-in methods, page layouts, MFA and session settings where supported |
  | External ID User Flow Attribute Administrator | Custom sign-up attributes |
  | External Identity Provider Administrator | Google and any other social sign-in |
  | User Administrator | Runner account support, such as a full-erasure request (see Privacy below) |
  | Reports Reader | Sign-in and audit logs to diagnose AADSTS errors; confirm the tenant's retention and API permissions |

- **Do not grant:** Global Administrator, Privileged Role Administrator, Conditional Access Administrator, Security
  Administrator or Authentication Policy Administrator to this CLI account. The narrower roles are still powerful:
  Application Administrator can add app credentials and impersonate an application's identity, and User Flow
  Administrator can change authentication controls. Omitting the broader roles does not make compromise harmless.
  See [Microsoft's role permissions](https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/permissions-reference#application-administrator).
- **Conditional Access (checked 24 November 2026):** the account is covered by "Taperday: require MFA for admins" and
  excluded from "Taperday: keep runners signed in" through its seven roles, as described in section 6. Recheck actual
  assignments and policy targeting after any approved role change. Do not infer MFA coverage just because a role appears in this table.
- **Signing in:** use the tenant ID from your password manager, sign in as the dedicated member account in a private
  window, and complete the required authentication. Do not share the device code, password, MFA response or token:

  ```bash
  az login --tenant '<tenant-id>' --allow-no-subscriptions --use-device-code --output none
  ```

  Use `az rest` so Azure CLI supplies the bearer token internally. For example, this read-only request suppresses the
  policy response; success establishes API access only, not correct targeting or enforcement:

  ```bash
  az rest --method get \
    --url 'https://graph.microsoft.com/v1.0/policies/conditionalAccessPolicies' \
    --output none
  ```

  The account's role and Azure CLI's existing delegated Graph permissions both matter. If access or consent is
  missing, report the check as blocked; do not grant extra permissions automatically. Avoid token-extraction commands,
  `--debug`, shell tracing and unredacted Graph output in shared logs. Azure CLI maintains its own credential cache:
  protect that profile and use `az logout --output none` when the temporary task is finished. Never copy tokens into
  source files, screenshots, chat or custom caches.
- **Changes are proposed first.** An authorized script or assistant may perform scoped read-only checks, but must
  describe each write and wait for the owner's approval. Role assignments, consent, credentials, user-flow settings
  and Conditional Access changes all count as writes. No real runner account may be altered as a test.
- Check whether time-limited activation is supported in this tenant before using it. Microsoft's
  [PIM licensing requirements](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-configure)
  include Entra ID P2 or Entra ID Governance; feature availability must be verified separately. Lack of PIM does not
  justify granting all seven write/read roles permanently. Review and minimize any standing assignments.

## Database

Locally the API uses LocalDB and migrates itself on start in Development. In Azure, use the configured Azure SQL Basic
database with the connection string in App Service configuration or Key Vault, never in
appsettings, and apply migrations from the deploy pipeline:

```bash
dotnet ef migrations bundle --project src/StartLine.Infrastructure --startup-project src/StartLine.Infrastructure
```

## Privacy (POPIA)

- Runners must accept the privacy notice to sign up; the version and time are stored. When `PrivacyNotice.CurrentVersion`
  changes, runners on an older version see "We've updated what we keep" and accept again (`PUT /api/v1/me/privacy`)
  before they can save, upload or connect anything. Reading, exporting, disconnecting and deleting never wait.
- Heart rate has its own, optional consent (at sign-up, on the update screen and in Account). Without it runs are kept
  with no heart rate; withdrawing deletes what's held. The full policy is the public page `/?view=privacy`.
- `GET /api/v1/me/export` returns everything stored about the runner.
- `DELETE /api/v1/me` deletes the runner and every plan. Their sign-in itself lives in External ID: delete
  the user there too if they ask for full erasure.
- When illness tracking arrives, store only "unwell from/to", never symptoms.
