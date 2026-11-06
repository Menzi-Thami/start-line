# Taperday UX redesign: approved decisions

These decisions belong to the UX handover (#202), its phases (#203) and the Gate A proposal.

## Gate A: 6 November 2026, approved by the user

| Decision | Choice | Notes |
|---|---|---|
| Brand | **Frame in light, Night Run in dark** | The user decided this mid-build. Light keeps Frame, the look shipped in #129: sage, and Instrument Serif and Sans. Dark becomes Night Run: a near-black ground, the volt accent `#d7ff3e`, volt primary buttons with near-black text, and volt-tinted cards. Only the dark token blocks in `tokens.css` changed. Type stays Instrument in both themes, so a page keeps its shape when the theme switches. |
| Bottom bar | **Home · Plan · Runs · Progress · Account** | Progress becomes a top-level destination. Strength stays inside Plan and in each day's detail. |
| Where the bar shows | Phones and tablets below 1024 px | It also shows for runners who are signed out but have a plan open. |
| Desktop (1024 px and wider) | A left rail | The rail has the same five destinations in the same order. It replaces the header links. |
| Where the bar hides | The plan-building film and the date picker | |
| Plan-building film | Restore production's five scenes and their props | The props are zzz, the start line, the km markers and the finish tape. There are still no tips or pause, and reduced motion skips the film. |
| Compositions | As shown on the Gate A page | Home puts the next session first and adds the latest run and Strava state. Plan gets one week heading and, on desktop, a split view with the week and the day. Workout completion gets the runner. Runs, run detail and Progress follow in Phase 2. |

## Open question

- **Night Run's fonts in dark:** Bricolage Grotesque and JetBrains Mono could be added if the user wants them. That needs self-hosted `@fontsource` packages, because the CSP blocks font CDNs.

## Deviations from #202

- **Progress:** the bar's Progress opens the plan in Progress mode. It has its own eyebrow and a highlighted bar item, and the plan's tools are hidden. It reuses the same Progress components, so there is one source of metrics, as #202 asks.
