# Test accounts and testing sign-in without the owner

How an agent or developer checks sign-in and runner journeys on taperday.run without asking the owner at every step.
Everything here uses **test accounts only**. Never sign in as, change or email a real runner. Automated suites never
target production ([testing.md](../testing.md)).

## What you can do alone, and what needs the owner

| Task | Alone? | How |
|---|---|---|
| Read the tenant (users, apps, user flows, audit and sign-in logs) | Yes, once the CLI admin session exists | [Access](#access) |
| Create, re-password or remove a test account | Yes | `scripts/entra-test-accounts.mjs` |
| Sign in to taperday.run as a test account with its password | Yes | [Checking a sign-in](#checking-a-sign-in) |
| Compare a runner ID before and after a change | Yes | `/password-check.html` → **Check account access** |
| Open a PR to `staging`, wait for CI, merge it | Yes | [how-we-ship.md](../how-we-ship.md) |
| Run an Ops workflow (for example **Ops - Move runner sign-in**) | Yes, on `main` | `gh workflow run` |
| Start the CLI admin session (device code + MFA) | **Owner** | [Access](#access) |
| Read an emailed code ("Forgot password?", email codes) | **Owner** | The codes go to the owner's test inbox |
| Press **3 - Release to production** | **Owner** | [Release](#release) |
| Portal-only tenant settings: which user flow an app uses, authentication methods, Conditional Access, branding | **Owner** | The CLI admin account lacks those permissions on purpose |
| Anything that costs money | **Owner** | Don't |

To keep the owner out of the loop, give test accounts a password you set with the script, rather than relying on
"Forgot password?" (which needs the inbox). Ask the owner for one thing at a time, with the full steps written out
(what to open, what to type, what to send back), never a fragment.

## Access

- **Tenant ID:** the GUID in production's `VITE_AUTH_AUTHORITY`:
  `gh api repos/Menzi-Thami/start-line/environments/production/variables/VITE_AUTH_AUTHORITY --jq .value`.
- **CLI admin session:** the owner runs, once, in a private browser window with "Use another account":
  `az login --tenant <tenant-id> --allow-no-subscriptions --use-device-code`
  (account and roles: [accounts-setup.md](../accounts-setup.md), section 8). It lasts days; ask again only when a call
  fails with an expired-session error. Afterwards set the default subscription back to the one the machine normally
  uses; never `az account set` to anything else.
- **Graph token:** `az account get-access-token --tenant <tenant-id> --resource-type ms-graph`. If another tenant is the
  CLI default, the tenant-level login is found with `--subscription <tenant-id>` instead. The scripts try both.
- **GitHub:** `gh` as the owner's account. Environment variable lists are paged at 10; add `?per_page=50`.

## The test accounts

Test accounts use the owner's test inbox with a `+tag` (`name+qa1@…`): mail to any tag lands in the same inbox, and
Microsoft treats each tag as a different account. Tags start with `qa`, `otptest` or `pwtest`; the script refuses any
other address. List them, with their object IDs, with:

```bash
node scripts/entra-test-accounts.mjs list --tenant <tenant-id>
```

Standing accounts (27 November 2026):

| Tag | Sign-in | Runner | Use it for |
|---|---|---|---|
| `+otptest3` | Password and email code | Yes, with a plan (signed up through the old email-code flow, then moved like every real runner) | Anything a signed-in runner does; the migration path |
| `+pwtest1` | Password | Check with `/password-check.html` | Password sign-in, reset |
| `+pwtest2` | Password (self-service sign-up) | Check with `/password-check.html` | Sign-up path |

Make a new one per experiment rather than reusing one whose state you don't know:

```bash
node scripts/entra-test-accounts.mjs create   --tenant <tenant-id> --tag qa1   # password account, no runner yet
node scripts/entra-test-accounts.mjs password --tenant <tenant-id> --tag qa1   # new random password
node scripts/entra-test-accounts.mjs remove   --tenant <tenant-id> --tag qa1   # soft delete, restorable for 30 days
```

Passwords go to `~/.taperday/test-accounts.json` on the machine that set them, never to the repo, a log or chat.
A new account has no runner: the first sign-in on taperday.run shows plan setup, and finishing it creates the test
runner. Test runners receive service notices like everyone else; that's expected and lands in the test inbox.

## Checking a sign-in

Use a fresh private window each time, so no earlier sign-in carries over.

1. Open `https://taperday.run/password-check.html` (a separate app on the same user flow and API; it can't change data).
2. Sign in with the test address. Microsoft should show **Enter password**. An existing account that only has an
   email code would show **Enter code** instead.
3. Tap **Check account access**. It shows the runner ID, or that setup is needed. Record the ID before a change and
   compare it afterwards. Don't tap "Continue to Taperday" on an account you don't want a runner for.
4. For the real app, open `https://taperday.run`, tap **Sign in** and check you land on that runner's plan.

Installed iPhone/Android apps (PWAs) and saved-password AutoFill need the owner's phone. An installed app keeps its
old session until the token expires (up to about an hour) or the runner signs out.

## Release

PRs go to `staging`. When CI passes, the owner runs **Actions → 3 - Release to production** with:
- `tested-staging-sha`: the full current `staging` SHA (`gh api repos/Menzi-Thami/start-line/commits/staging --jq .sha`),
  only after **1 - Checks** has passed on that exact commit; otherwise the release stops at its first step;
- `acceptance-evidence`: the PR link;
- `acceptance-confirmed`: ticked; `skip-staging-check`: ticked while the staging database is paused.

Ops workflows (`workflow_dispatch`) run from `main`, so a new one only works after a release.

## Things learnt the hard way

- **Microsoft can't add a password to an email-code account.** Graph returns 400 ("Adding a non-federated user
  signInType is not permitted …"). Existing runners were moved by recreating their account and re-pointing their runner
  row: [password-sign-in.md](../password-sign-in.md#moving-existing-email-code-runners).
- Taperday finds a runner only by the Microsoft object ID (`Runners.IdentitySubject`). A new account means a new runner
  unless the row is re-pointed. Never link accounts by email.
- An email can belong to only one account, including as a hidden proxy address on a disabled one: creating a second
  account with it fails with `DirectoryUniquenessException` / "same value for property proxyAddresses". Leave `mail`
  unset on the new account.
- `mail` can't be set to null; use a placeholder on the tenant domain.
- Changing an app's user flow only affects new sign-ups. Existing accounts keep their method.
- Microsoft's "last sign-in" field lags by hours. Use the sign-in log (`/auditLogs/signIns`) to see who signed in.
- Every change made by the CLI admin account shows in the audit log (`/auditLogs/directoryAudits`). Read it before
  and after a tenant change, and to see what someone else changed.
