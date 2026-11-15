# Your journey, races and trophy cabinet

Journey is a permanent account destination, available with or without a current training plan. Its URL is `?view=journey`; `section=training`, `section=races` and `section=cabinet` reopen the chosen section. Old `?view=plans` links also open Journey. Plan still includes This week, Calendar and Progress. The main navigation is Home, Plan, Runs, Journey, Account, with Plan omitted between training chapters.

## Training chapters

Replacing a plan retains the previous chapter. **Archive training plan** explicitly clears the current plan while keeping the chapter, logged runs, race result, achievements and recovery. It does not complete missed sessions, assume a race finish or stop recovery. A version check protects a plan changed on another device.

There is no lifetime count limit on saved plans. Journey reads 20 chapters at a time, with Load older chapters; failed paging keeps the loaded chapters and retry requests the same page. Reloads after a change refresh all pages already opened. Logged training remains read-only in an archived chapter; the race result can still be corrected.

## Race memories

A race result can belong to a plan or exist independently. Add a past race for an event run before joining Taperday, or confirm an existing plan's result. Both screens read and change the same stored result. Name, event distance and date are retained independently of the live race catalogue.

Choose an existing recorded run while adding a past race to fill its date without typing it again. Choosing a Major supplies its advertised marathon distance. The selected recording's actual distance and full elapsed time are loaded for explicit result confirmation; moving time is never substituted. Changing the event date clears a recording selected for another day.

The advertised event distance stays separate from the runner's actual distance covered. Times carry one of Unspecified, OfficialChip or RecordedElapsed. Confirming a recording uses its actual elapsed time, never moving time. Editing that suggested time clears the elapsed classification until the runner chooses a source. Older results remain Unspecified; an activity association does not establish official chip timing. Personal best labels compare only saved, explicitly identified chip times at the same standard event distance.

Saving uses a stable client-generated result id; retrying a lost response does not add another result. Updates and removals require the saved row version. A unique runner/event-edition key and recording association protect new results from duplicates. For custom events the identity is the trimmed name, date and event distance; recognised Majors use their event identity across known sponsor aliases. Similar names are not fuzzy-matched into a Major.

Legacy plans can contain more than one result for the same event. These originals remain visible with a review message and earn no cabinet trophies or personal best labels. Review the outcomes and remove the incorrect result. Removing it preserves its training chapter; the remaining result becomes eligible only once the ambiguity is resolved. The app never silently chooses a winning outcome from conflicting history.

Confirmed finishes and DNFs can lead to optional recovery. Recent races offer recovery from the result itself. Recovery remains available from Journey and Home after archiving the last current plan. Older races are memories, not prompts to start recovery months or years later.

## Trophy cabinet

Every unambiguous confirmed finish has a place, including 5Ks, halves, ultras and local events. DNS and DNF records remain in race history and do not earn finisher trophies. Corrections and removal update the cabinet through the same result data; there is no second store of awards to drift out of sync. Repeated editions remain separate finishes, with one collection medal per Major event.

The maintained collection has eight events as checked on **15 November 2026**: Tokyo, Boston, London, Berlin, Chicago, New York, Sydney and Cape Town. The original six have their own progress count. Sydney qualifies from 2025 and Cape Town from 2026. A pre-eligibility finish remains a general race finish.

This is a personal collection, not official Abbott World Marathon Majors star verification. In particular, the exceptional Sydney 2024 Age Group World Championship eligibility is not inferred. The catalogue's `Major` boolean means a featured race and is not used to award a collection medal. Membership changes require an explicit update to `MarathonMajors` and its regression cases.

Official reference pages: [current series](https://www.worldmarathonmajors.com/about), [Sydney eligibility](https://www.worldmarathonmajors.com/sydney-major), [Cape Town eligibility](https://www.worldmarathonmajors.com/cape-town-major), [official result claiming](https://www.worldmarathonmajors.com/six-star/claim-stars).

## Sharing and retention

Cabinet cards are 1080 × 1920 portrait images, with a PNG download and SVG fallback. A runner with Major finishes shares the earned collection and total finish count; a runner whose finishes are other distances gets a finish-focused achievement card. File sharing prepares the image before the tap to retain the native user gesture, with text/clipboard fallbacks. Native destinations still depend on each device and receiving app.

New race metadata is included in account export. Account deletion removes independent results and plan-linked results through direct runner ownership. The migration retains recoverable old event metadata and does not guess a time source or discard duplicate evidence. Schema rollback refuses to proceed while independent results exist; use a reviewed forward fix or export/migrate those results first, rather than deleting history to fit the old schema.
