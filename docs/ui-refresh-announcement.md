# UI refresh customer announcement — draft release plan

Related UX planning: [PR #185](https://github.com/Menzi-Thami/start-line/pull/185). This PR is **not** a sending workflow. It adds a branded composer and tests, but no production broadcast trigger.

## Customer message (approved direction; final wording contingent on shipped features)
- **Subject:** Same training. A whole new view.
- **Preheader:** A clearer week, easier run details and progress that’s simpler to follow.
- **Tone:** energetic but friendly, short sentences, no developer language, no AI/Strava jargon, no promises that are not live.
- **Core user benefits:** a clearer week, a dedicated view for each training day, runs that explain what happened, easier-to-read progress, obvious completion indicators and better fit on phone/laptop. Say the user's existing plan and runs remain.
- **CTA:** See my Taperday — https://taperday.run/?view=home
- **Brand:** reuse `EmailLayout` frame theme, mascot, wordmark, sage accent, system fallbacks. Static HTML and plain text, never CSS animations or embedded JS.

## Before / after images — mandatory preparation
A real comparison, not generated promotional art or staged fake production screenshots:
1. Before implementation, capture the *current real production UI* for one representative week with no personal identity or location data visible, at **390px mobile** (and optionally desktop at 1440px). Capture accurately with consistent date/run states.
2. After approved release, capture the *implemented real production UI* at exactly the same viewport, date and seeded/anonymized data, and same theme. Do not mislabel a design mock as 'After'.
3. Review legibility in mobile email clients. Crop around the component, not arbitrary phone chrome; export optimized PNG/JPEG/WebP where supported (prefer PNG/JPEG for mail). Attach images to PR for review and add final public assets to `client/public/email/ui-refresh/before.png` and `.../after.png` only after both exist. Verify URLs publicly return 200.
4. Pass those two exact HTTPS first-party URLs to `UiRefreshAnnouncement.Compose`; no image markup appears if either image is absent or not approved. Provide alt text and text fallback. Consider stacking screenshots vertically for small screens; don't make them too tall for the email's first viewport.
5. Optional second comparison for Calendar status coloring only if it remains concise, avoids email bloat and is genuinely shipped.

## Release gate and delivery strategy
**Friday 6 Nov 2026 evening (SAST)** is a *candidate*, **not a committed campaign send**. The proposed UI redesign in PR #185 is still a planning draft; do not announce it as available until Wave 1 (and any named features in this email) are shipped, tested and accessible to recipients. If release is after Friday, defer send until **the evening following verified deployment** or a user-approved date; never automate a campaign prematurely.

Current code already has Brevo, `UpdateEmails`, `UpdateBroadcast` composer and update-email opt-out. As inspected 4 Nov 2026, `UpdateBroadcast` **only composes**; there is no broadcast scheduling/sending endpoint. This PR intentionally does not introduce one or send a message.

Before making the broadcast live:
- Require explicit release and campaign approval; confirm deployment version, visible functionality, finalized real screenshots and approved copy.
- Restrict recipients to existing Taperday **news and updates** preference (`UpdateEmailsOffAt == null`) as appropriate, excluding unsubscribed/uncontactable users. Verify legal basis and applicable local email rules; do not use weekly-recap preference as permission for promotional mail.
- Honor Taperday's update-only unsubscribe link and List-Unsubscribe / List-Unsubscribe-Post header through the existing `UnsubscribeLinks` mechanism. Do not modify weekly recap preferences.
- Test preview to the site owner first; inspect Gmail, Outlook, iOS Mail, light and dark, images-off and plain-text. The public screenshots should be privacy-safe.
- Build an **explicit idempotent campaign sender/scheduler in a separate reviewed PR**, with one delivery per runner, dry-run/preview, small batches, Brevo rate limit and daily quota (currently documented 300 emails/day), retries, failure logs and cancellation, and no customer data logged. Avoid startup-send loops or duplicate broadcasts. Respect Monday recap usage and other email volume.
- Verify intended send time (runner local vs fixed SAST) and timezone. Friday 19:00 SAST is a *suggested* optional time, not an approved scheduled job.
- Send only after all conditions pass. If not possible, leave draft PR open.

## Acceptance checklist
- [ ] Finalize copy to accurately describe *only* deployed features; remove future claims.
- [ ] Supply real before + after screenshots with matching state/viewport, no personal data and 200-returning public paths.
- [ ] Preview and test on mobile and desktop email clients incl. images blocked, email plain-text and high-contrast/dark mode.
- [ ] Run `UiRefreshAnnouncementTests` plus relevant email tests; verify unsubscribe behaviour.
- [ ] Confirm recipients' news/update preference, caps, opt-out and no duplicate dispatch.
- [ ] Release verified live; human approves campaign before scheduling/sending.
- [ ] Leave PR draft and unsent until all gates are satisfied.

## Work map
- `src/StartLine.Application/Features/Insights/UiRefreshAnnouncement.cs`: **pure** message composer, release claims and optional first-party screenshot pair.
- `tests/StartLine.Application.Tests/Onboarding/UiRefreshAnnouncementTests.cs`: copy, preview and image handling.
- `src/StartLine.Application/Features/Insights/EmailLayout.cs`: existing branded email frame and unsubscribe links.
- `src/StartLine.Application/Features/Insights/UpdateBroadcast.cs`: current eligible-recipient composer; cannot send or schedule on its own.
- `docs/email.md`: Brevo setup and opt-out rules.

No emails have been sent, no date has been scheduled, and no preview images have been fabricated.
