# Runs and run page simplification: before and after

Synthetic runner and recordings only, served from a private Vite port (5187) (`client/e2e/simplify-runs-qa.spec.ts`, real App through the `journey.html`
fixture with mocked API responses). Before captures use staging at `8319334` (after the Plan PR #277; Runs unchanged there); after captures use the `simplify/runs`
branch. Re-run with `SIMPLIFY_RUNS_CAPTURE=1` (add `SIMPLIFY_RUNS_BASELINE=1` for the before set).

| Screen | Phone 375, light | Phone 375, Night Run | Desktop 1440, light | Desktop 1440, Night Run |
| --- | --- | --- | --- | --- |
| Runs | [Before](before/runs-375-light.png) / [After](after/runs-375-light.png) | [Before](before/runs-375-dark.png) / [After](after/runs-375-dark.png) | [Before](before/runs-1440-light.png) / [After](after/runs-1440-light.png) | [Before](before/runs-1440-dark.png) / [After](after/runs-1440-dark.png) |
| Add runs | [Before](before/add-runs-375-light.png) / [After](after/add-runs-375-light.png) | [Before](before/add-runs-375-dark.png) / [After](after/add-runs-375-dark.png) | [Before](before/add-runs-1440-light.png) / [After](after/add-runs-1440-light.png) | [Before](before/add-runs-1440-dark.png) / [After](after/add-runs-1440-dark.png) |
| A run | [Before](before/run-page-375-light.png) / [After](after/run-page-375-light.png) | [Before](before/run-page-375-dark.png) / [After](after/run-page-375-dark.png) | [Before](before/run-page-1440-light.png) / [After](after/run-page-1440-light.png) | [Before](before/run-page-1440-dark.png) / [After](after/run-page-1440-dark.png) |

Notes:

- "Before" Add runs shows both old disclosures (Connect through Strava, Add runs from a file) expanded; "after" shows the one Add runs button opened.
- "Before" run page shows the Overview tab (the other three tabs are hidden); "after" is the whole single scroll.
- On desktop the run opens beside the list, so the full-page capture shows the run pane's visible height.
