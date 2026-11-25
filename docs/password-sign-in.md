# Password sign-in and production checks

This implements the isolated password-check and provisioning part of the
[Release Readiness Page](https://chatgpt.com/space/page_4e0cdceb0e188191b8f7265ba9eb9f8e).
The owner authorised production testing while staging SQL is paused. Use a dedicated test identity.

## Implemented behavior

`scripts/entra-passwords.mjs` verifies the production SPA and its current Microsoft user flow. It defaults to read-only.
`--create` prepares a new, **unassigned** password flow, preserving attributes, extensions, Google and other federation.
It does not change the current application's flow, edit users, reset credentials, alter MFA/Conditional Access or grant
permissions. A matching unassigned candidate is reused; ambiguous bindings and modified candidates fail closed.
An uncertain write is never replayed automatically.

`/password-check.html` uses a separately configured Microsoft SPA against the existing API. The main app keeps its client
and callback. Missing, invalid or reused client configuration disables the check. Credentials stay on Microsoft's pages.
The check only calls `GET /api/v1/me` on a deliberate tap and shows the authenticated runner ID for identity comparison.
It cannot create or link a runner, change a password, upload a run or connect Strava. Stalled work is bounded and cancelled
on account/session changes. No token or credential is displayed.

**Existing OTP-to-password conversion is not implemented or claimed.** Changing the user flow affects new customers;
existing customers keep their original method. Password reset does not prove that an OTP identity can be converted.
AUTH-01 stays open until a Microsoft-supported upgrade has been demonstrated on disposable identities while preserving
the original application runner/history keys. Do not delete/recreate customer objects, link by email, or add an unverified
`passwordProfile` write to work around this limitation.

## Tenant administrator steps

Use Node 22+ and Azure CLI signed into the **External ID customer tenant**. Inspection requires `Application.Read.All`
and `EventListener.Read.All`. Creation requires `EventListener.ReadWrite.All` and an appropriate role, such as External ID
User Flow Administrator. Use an owner-approved admin client; do not grant these permissions to Taperday's SPA, API or
GitHub deployment identity. The script consumes the CLI credential in memory. Never paste tokens/passwords into chat.

Inspect first, using the production website application's client ID:

```bash
node scripts/entra-passwords.mjs --tenant EXTERNAL_TENANT_GUID --app PRODUCTION_WEB_CLIENT_GUID
```

Review the source flow, providers and proposed metadata, then prepare the unassigned candidate:

```bash
node scripts/entra-passwords.mjs --tenant EXTERNAL_TENANT_GUID --app PRODUCTION_WEB_CLIENT_GUID --create
```

The output contains tenant flow metadata; keep it private unless reviewed for sharing. If a creation response is uncertain,
inspect the tenant before retrying. The current session has no tenant-admin identity or GitHub environment-variable write
access, so these live steps remain blocked on the administrator.

Register a separate **Taperday password check** SPA in that same tenant, with the exact callback
`https://taperday.run/password-check.html`. Authorise the same delegated production API scope as the main website.
Associate **only the check app** with the candidate. Keep the main app's current binding. Enable and verify customer
self-service password reset through Microsoft's documented tenant settings; keep required MFA/Conditional Access in force.

Set production's `VITE_AUTH_PASSWORD_CHECK_CLIENT_ID` to the check application's client ID, then deploy the reviewed code
through an owner-approved production test release. The existing client, authority and scope settings remain as configured.
`VITE_AUTH_PASSWORDS` changes explanatory copy only; it does not enable password authentication.

## Live acceptance

Use `/password-check.html` in a separate/private browser session to protect a runner's unsynced drafts.

1. Create a fresh test identity. Confirm Microsoft's page really collects and accepts a password; a successful redirect
   alone does not prove the authentication method. The previous hosted signup error must not recur.
2. Sign out, use the password again, then exercise an incorrect password and cancel/back. Check native password-manager
   AutoFill on actual phones; Taperday does not implement a biometric prompt.
3. Use Microsoft's **Forgot password?** flow, receive the code in the dedicated inbox, set a new password and sign in.
   Verify Google still works where configured.
4. Check API access. A new identity without a Taperday profile must report setup required, without creating/linking a runner.
   For an existing password-backed test identity, compare its exact runner ID and history before/after password reset.
5. Check an existing OTP-only identity using its original method. Its `oid`, runner ID, plans, history and connection keys
   must stay unchanged. Record this as compatibility, not a completed password migration.
6. Repeat expiry/relaunch/logout on actual installed iPhone and Android PWAs. Record provider/device evidence in the Page.

Only after acceptance may the owner assign the main web app to the candidate for **new registrations**. Record the old
flow/app IDs first. If signup or Google fails, restore the previous main-app binding. Keep a used password flow available
to password customers; never delete user objects as rollback. Removing the check client variable and redeploying disables
the check page. Deleting an unused unassigned candidate is a separate administrator action.

## Sources

- [Existing-user behavior](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers)
- [Graph v1.0 flow creation](https://learn.microsoft.com/en-us/graph/api/identitycontainer-post-authenticationeventsflows?view=graph-rest-1.0)
- [Customer password reset](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-enable-password-reset-customers)

Automated tests use synthetic responses/identities. They do not establish live password signup/reset or native-device
acceptance. No live tenant change or production deployment has been performed by this implementation.

## Mobile preview

The check page retains Taperday's existing wordmark, colours and typography. These 375 px Chromium screenshots use
a synthetic signed-in identity and a mocked read-only account response, not a live password sign-in.

| Night Run | Daylight |
|---|---|
| ![Night Run account check](qa/2026-11-25/password-sign-in/mobile-dark.png) | ![Daylight account check](qa/2026-11-25/password-sign-in/mobile-light.png) |
