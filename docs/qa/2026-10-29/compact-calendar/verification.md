# Compact calendar dropdown — 29 October 2026

The day summary now expands in the existing weekly/monthly calendar flow. It is bounded to 34 rem wide and the smaller of 24 rem/60 dvh high, with internal scrolling for longer details. The page remains interactive and scrollable. There is no modal, backdrop, full-height side panel or body scroll lock.

Selecting a date again collapses it. Selecting another date replaces its contents; changing month or tab dismisses it. Date buttons expose expanded state and their controlled region. The heading receives focus on open, Tab moves naturally through the page, and Close/Escape restores the selected date without stealing focus during outside navigation. The first browser pass caught a focus-return issue after save removed the focused form control; this is fixed, including returning focus to the heading after closing the new-run form.

Focused verification: **35 frontend tests** passed, then **11 Chromium desktop/phone journeys** passed against the final feature source. These cover compact bounds, no page scroll lock or keyboard trap, date toggling/switching, outside dismissal, month/tab changes, unchanged URL, keyboard return focus, reduced motion, 320–2560 px layouts with production fonts, and the existing save/edit/reload/cache-expiry/manual/time-only/share/delete flows. Attached phone and desktop screenshots were reviewed.

The full `scripts/check.sh` gate passed against feature source `1475ae1d93ff9b02781ab91952af172bb5862ca5`. The subsequent commit records documentation/screenshots only.

- Backend formatting and strict Release build passed with 0 warnings/errors.
- **1,195 backend tests** passed (848 domain, 103 application, 7 architecture, 237 local SQL integration); no skips/failures. EF model/migration consistency passed.
- Frontend lint/TypeScript and **569 tests in 67 files** passed.
- Production build passed; the lazy day-view chunk is **8.00 kB / 2.75 kB gzip**. Audit found **0 vulnerabilities**.
- **50 Playwright journeys** passed. Phone/tablet/desktop/ultrawide checks cover 320, 375, 390, 768, 820, 1024, 1440 and 2560 px, including production-font layouts. Dropdown bounds remain at most 544 × 384 CSS pixels at the tested default font size.
- Final diff reviewed; data persistence and API contracts are unchanged.

No backend/API, storage, provider-retention or generator changes. Synthetic accounts/activities and a disposable local SQL test database only; never production test data. Physical iOS/Android/WebKit and live identity/provider authorization are not established by Chromium emulation.
