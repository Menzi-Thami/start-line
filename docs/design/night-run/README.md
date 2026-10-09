# "Night run": the approved redesign

Approved on 9 October 2026 and **built into `client/`** in five pull requests (#23 to #27, below), so the live site
now has it. These are the **concept screens** it was built from. The interactive versions, with every animation playing, live on the design canvas at
https://claude.ai/artifact/C2av5H74ixmNehMA8JuRbA (private to the owner). The `.concept.html` files here are their
source, kept for reference; they need that canvas's runtime to render.

| File | Screen |
|---|---|
| `home.concept.html` | Home page, desktop (reflows to phone) |
| `plan-phone.concept.html` | A plan's "This week", on a phone |
| `sign-up-phone.concept.html` | Signing up, on a phone |

## The look

Inspired by Godly (tactile, physical motion), Aceternity's studio template (bento grid, live mini-mockups, dashed
construction lines) and current iOS running apps (dark, one electric accent, frosted glass).

| Token | Value | Use |
|---|---|---|
| Ground | `#0a0a0b` | Page background |
| Volt | `#d7ff3e` | The accent: primary buttons, rings, highlights, the "day" in the wordmark. Text on volt is always `#0a0a0b` |
| Coral | `#ff5a36` | Second accent, sparingly (race bibs, taper bars) |
| Violet | `#7c5cff` | Third accent, sparingly (race bibs, easy-pace bar) |
| Text | `#f2f2f2` / `#b9bcc3` / `#9ea2aa` | Primary / secondary / muted |
| Glass | `rgba(255,255,255,0.07→0.03)`, 1px `rgba(255,255,255,0.12)` border, 22px radius, `backdrop-filter: blur(14px)` | Cards |

Type: **Bricolage Grotesque** (display, 800), **Atkinson Hyperlegible Next** (body), **JetBrains Mono** (new: numbers,
paces, dates, bib numbers). Buttons are chunky pills that spring on hover and press. The tapering wordmark stays.

Rejected along the way, so not to revisit: cream and brown (too bland), SA-flag/Ndebele and Xhosa-inspired palettes.
An "asphalt slate" variant (`#121824` base, tinted cards, film grain) was compared side by side; the near-black
original was kept.

## The theatre

1. **Intro, once per visit (about 3.5 s):** a runner crouches on the start line, a starter raises the pistol, a muzzle
   flash and a volt flash across the screen, "GO!", the runner sprints across and "taper**day**" lands letter by letter
   in their wake, then the screen lifts like a curtain. No text saying "On your marks" (removed on request).
2. **Hero:** speed lines stream behind the headline; a countdown ring draws itself to "days to go".
3. **Race ticker:** a volt band of races scrolling.
4. **The race rack:** race bibs hang from hooks on a rail and sway; touching one makes it swing harder.
5. **The course:** a route line draws itself as you scroll; steps rise in; a springy slider picks experience.
6. **Bento:** working miniatures: tick a run (volt confetti), pace bars that grow, the build-up chart.
7. **Plan on a phone:** header drops in, runs slide in one after another, ticking pops confetti, and a floating
   frosted-glass tab bar. The progress ring and the runner on the course bar are driven by **today's date**: the ring
   fills day by day from the plan's first day and closes completely on race day, and the runner moves along the course
   towards the chequered flag. What the runner does depends on the day:
   - **Training day:** sprints on the spot where today is.
   - **Rest day:** lies down asleep, breathing slowly, with "z z z" drifting up (also on the rest day's card).
   - **Race day:** at the flag, bursting through the finish tape with arms up; the week is replaced by one volt
     "It's race day" card with falling confetti.

   (The concept's dashed "Training day / Rest day / Race day" switch is only there to preview the states.)
8. **Sign-up:** the button squashes; the runner dashes off to "the sign-up desk" ("Lacing up…", "Finding the other
   sock…", "Pretending to stretch…"); back from the email code, the name you type prints live on your race bib, the bib
   number rolls like a slot machine, ticking the privacy notice slams an OFFICIAL stamp on it; then safety pins pop in,
   confetti falls and the runner hops: "You're on the start list!"

Microsoft hosts the email-code page itself, so it can't animate; give it the same colours and logo with Entra's
Company Branding.

**Within reason:** nothing makes anyone wait or blocks what they came to do; every animation stops for
`prefers-reduced-motion`; tap targets stay at least 44px; text contrast stays at 4.5:1 or better.

## Building it (one pull request each, all merged)

1. Design tokens and type (palette, JetBrains Mono, glass cards, pill buttons); update `docs/brand.md`, where volt
   replaces track red. (#23)
2. Intro (once per session, skipped for reduced motion) + hero ring + race ticker. (#24)
3. Race rack, bento grid and experience slider on the home page. (#25)
4. Plan page restyle: glass tab bar, sliding runs, confetti tick, course bar with the runner, which sleeps on rest days and breaks the tape on race day. (#26)
5. Sign-up: the dash-off before the Microsoft redirect, the bib-builder profile step, the start-list celebration. (#27)
