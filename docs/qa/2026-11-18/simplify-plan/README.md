# Plan tab simplification: before and after

The Plan tab after the whole-app simplification brief: fewer sections, buttons and words, with the same capabilities.
Captures come from `client/e2e/simplify-plan.spec.ts`: the real App through the `journey.html` test fixture, with synthetic
API responses (a 5K plan, one uploaded run, no coaching notes) and the clock fixed at Tuesday 20 October 2026. No real
runner or production data is used. `PLAN_BASELINE=1` wrote the before set from staging at `42e6b1c` (#275); the after set
is this branch.

| Screen | Phone 375, light | Phone 375, Night Run | Desktop 1440, light | Desktop 1440, Night Run |
| --- | --- | --- | --- | --- |
| This week | [Before](before/week-375-light.png) / [After](after/week-375-light.png) | [Before](before/week-375-dark.png) / [After](after/week-375-dark.png) | [Before](before/week-1440-light.png) / [After](after/week-1440-light.png) | [Before](before/week-1440-dark.png) / [After](after/week-1440-dark.png) |
| Calendar | [Before](before/calendar-375-light.png) / [After](after/calendar-375-light.png) | [Before](before/calendar-375-dark.png) / [After](after/calendar-375-dark.png) | [Before](before/calendar-1440-light.png) / [After](after/calendar-1440-light.png) | [Before](before/calendar-1440-dark.png) / [After](after/calendar-1440-dark.png) |
| Progress (More detail open) | [Before](before/progress-375-light.png) / [After](after/progress-375-light.png) | [Before](before/progress-375-dark.png) / [After](after/progress-375-dark.png) | [Before](before/progress-1440-light.png) / [After](after/progress-1440-light.png) | [Before](before/progress-1440-dark.png) / [After](after/progress-1440-dark.png) |
| Tools (before: Plan tools and Plan options opened) | [Before](before/tools-375-light.png) / [After](after/tools-375-light.png) | [Before](before/tools-375-dark.png) / [After](after/tools-375-dark.png) | [Before](before/tools-1440-light.png) / [After](after/tools-1440-light.png) | [Before](before/tools-1440-dark.png) / [After](after/tools-1440-dark.png) |

Full-page captures show the fixed bottom bar where the viewport ended; that is the capture, not the layout.

Limits: Chromium only, emulated widths, reduced motion. Race-week prep, the weekly review with a coach's note and the
Change my plan forms are covered by the browser specs (`race-week`, `life-happens`, `notification-settings`) rather
than these screenshots.
