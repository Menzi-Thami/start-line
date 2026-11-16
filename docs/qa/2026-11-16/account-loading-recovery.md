# Production account-loading recovery

The incident screenshots show a cached greeting with an unknown current chapter, followed by Safari's raw aborted-fetch error. PR #271 is the single incident fix; no separate incident PR is used.

The existing delayed SignInWait controls remain on cached Home. Account loading now has a hard 60-second budget covering token acquisition, reads and retries. Retry/unmount cancel the latest attempt; late responses cannot overwrite a newer account or a successful retry. Native Safari aborts are transport failures unless the caller explicitly cancelled. Read retries remain bounded; writes are not automatically retried.

For the recognised account whose own snapshot is present, navigation remains available during a slow load or error. Unknown, different, signed-out and unregistered identities do not receive someone else's cached navigation/profile. An unknown plan does not create a ghost Plan tab.

Verification includes:
- Existing cached Home slow-load regression, with a navigation assertion.
- Transport tests for native Safari aborts, response-body aborts, caller cancellation and no write retries.
- Hook tests for hung tokens, hung reads, cancellation on retry/unmount, late responses and account changes.
- Real App browser journey: cached Home, slow controls, hard deadline, retry, saved Hoka chapter, then Journey navigation. Runs on desktop/phone Chromium and the Android, iPhone, iPad and Firefox CI profiles. CI captures timeout/recovered screenshots with synthetic data.

This fixes client recovery; it does not establish the cause of the production API delay. Production SQL Basic is always on; the F1 API can sleep. Live production health and Azure request logs must establish the infrastructure state. No production account data, schema, tier, billing settings or service-worker behaviour changes are included.
