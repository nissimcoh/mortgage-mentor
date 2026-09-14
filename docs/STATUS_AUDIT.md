# Calculator accuracy and UI audit

## Starting point

Reviewed the existing repository, its recent saved-scenario work, mortgage engine,
form serialization, and calibration backlog. The previous conversation itself was
not available as project context. Baseline: 464 tests passed; lint had one error
in LanguageSwitcher and eight warnings.

## Corrections

- Near-zero positive rates could cause cancellation in the Spitzer denominator
  and return Infinity. Use log1p/expm1 for stable, algebraically equivalent annuity
  and annual/monthly conversions, including variable-rate repricing.
- CPI-linked calculations did not stamp the forecast curve on submission. All
  forecast-based drafts now pin their curve before saving/sharing, including
  initial URL hydration; Makam also pins its anchor snapshot.
- Share links now serialize the submitted calculation rather than the current
  browser URL, which may reflect an edited track list. Edit metadata is excluded.
- Edited inputs show an explicit notice while the previous results remain visible.
- The language menu no longer synchronously updates state inside an effect.

## Calculator and design

Added a responsive payment timeline driven directly by every row of the combined
schedule, with a keyboard-accessible month slider and precise monthly payment and
remaining-balance values. Improved form spacing, the main action, keyboard focus,
reduced-motion CSS, result scroll offset under the sticky header, and outdated
calculator introductory copy in Hebrew and English.

## Verification

- 470 unit/regression tests passed (26 files), including new tests for near-zero
  rates and source pinning/URL round trips for all four forecast-based products.
- Lint: no errors; seven pre-existing unused-variable warnings remain.
- Final production build and all 23 route smoke checks passed.
- Chrome desktop: inspected the timeline, incremented the month and verified the
  balance against the table; edited 4.8% to 5%, observed the stale-result notice,
  recalculated, and verified the first payment changed from 4,583.98 to 4,676.72.
- Mobile-device rendering and authenticated save/edit flows were not manually
  exercised in this audit.

## Accuracy boundaries

Passing regression tests is not full commercial-bank calibration. The existing
Prime golden benchmark remains green; other forecast products still need the
bank fixtures listed in CALIBRATION_TODO.md. No new bank-level accuracy claim is
made. Forecast-curve pinning alone does not freeze every external input: Prime
still uses the bank-of-Israel policy rate supplied by current market context.

The model excludes bank fees and contract-specific timing mechanics. Bank of
Israel describes the overall forecast rate as including fees and expected changes
in anchors/rates/inflation, so the application's modeled rate should not be
presented as identical to a binding bank quote:
https://www.boi.org.il/publications/pressreleases/a05-07-23/


## Continuation: variable CPI-linked and Liquid Glass

Implemented a sixth track: variable CPI-linked government-bond, resetting every
five years (Spitzer; currently terms 10/15/20/25/30 years). The real zero curve now
crosses the server/client market boundary. The engine combines real forward
rates with monthly CPI indexation; rate and inflation stress are separate.
The track is supported in the form, URL round trip, stored payload, summaries,
stability indicator, monthly schedule and timeline. Calculator version: 1.1.0.
Bank calibration remains pending and is disclosed beside the track.

Liquid Glass surfaces now cover calculator panels, track cards, results, market
cards, saved scenario cards, and navigation. A static pastel background provides
color through translucent surfaces; blur, specular borders and shallow shadows
provide depth. Inputs remain nearly opaque. Reduced-transparency and forced-color
fallbacks are included, and mobile bottom navigation retains safe-area spacing.

Verification: 481 tests passed; full TypeScript check and production build passed.
Lint has no errors and seven existing unused-variable warnings. Added two route
checks requiring rendered results for the new track in Hebrew and English.
All 25 route smoke checks passed, including real rendered result sections for both new-track routes.
Safari desktop visual review confirmed the glass form, new track labels, results
and source freshness. Direct navigation exposed a header-only shell under an
empty Suspense boundary. Removed that boundary from the already dynamic route;
production build and route checks pass. Native Safari select styling was also
corrected. Both final visual checks are handed to the user as requested.


## Session completion — September 13, 2026

- Home now prioritizes first/maximum/total-payment explanations, the calculator,
  saved scenarios, and official market context. Removed the obsolete saved
  scenarios “coming soon” claim and replaced placeholder learning cards with
  concise explanations.
- Home uses the same official Directive-451 curve adapter as the calculator.
  It displays BOI rate, derived prime, observed CPI, active forecast publication,
  and expected 12-month CPI change derived from that curve's index path.
- Static staff inflation forecasts and the manually maintained decision calendar
  are no longer displayed on home. Rate dates are labeled as observations,
  avoiding an unsupported claim about when the rate first took effect.
- Every displayed source has a direct link and a live/stale/fallback label.
  BOI rate/CBS source cache: 1 hour. Forecast/Makam cache: 6 hours.
- One-off automated integration check fetched and parsed BOI SDMX rates, CBS CPI,
  BOI nominal/real/CPI workbooks and publication schedule, and BOI Makam data.
  All returned live data; real curve had 360 values and CPI path 361. Temporary
  network test removed so ordinary unit tests remain offline and repeatable.
- Glass styling extended to home, sign-in, saved empty/detail states, menus,
  and save/edit dialogs, with readable input surfaces and accessibility fallbacks.
- A preliminary bank comparison is recorded in CALIBRATION_TODO.md. It does not
  replace full calibration; all new manual checks are now delegated to the user.

### User visual and comparison checks

1. Open /he and /he/calculator directly, then reload. Confirm the form appears
   without changing language. Check both on a phone and desktop.
2. On home, inspect source dates/statuses and open the official source links.
   Check the forecast publication agrees with calculator source details.
3. Compare identical inputs in both calculators: track, amount, years, rate and
   forecast publication. Record first payment, maximum, total and overall rate.
   Suggested first case: variable linked / 500,000 / 20 years / 3% / five-year reset.
4. Edit the rate, recalculate, move the month slider through 60 → 61, and compare
   the displayed payment and balance with the schedule. Test a mixed scenario too.
5. Check Hebrew/English layout, mobile navigation, save/edit after sign-in and
   shared-link reopening. Confirm menus and dialogs remain legible over glass.

Final automated verification after the home/design changes: 481 tests passed in
27 files; TypeScript and production build passed; all 25 route checks passed,
including home forecast content and rendered linked-track results in both
languages. Lint: zero errors, seven existing warnings. No manual browser checks
were performed after the user's request to take over visual QA. Local production
preview is available at http://localhost:3101/he . Changes remain local.

## September 13 follow-up: stale rate display and learning glossary

The user reported July 6 as the last rate update. Before the fix, an automated
request to the production home at port 3101 confirmed the rendered page contained
fallback data (no 3.25 rate), while a direct BOI CSV fetch returned 3.25 with a
September 12 observation. July 6 is the bundled fallback verification date.
The prior external connectivity test did not verify the rendered production page;
its success was insufficient to claim that the UI was serving current data.
The home was statically rendered with hourly revalidation, allowing a fallback
snapshot to remain in the served page. The original transient failure was not
captured, so its precise network cause is unknown.

Changed small BOI-rate/CBS feeds to no-store request-time reads with one retry.
Home is now dynamically rendered; a fresh request retries source access rather
than retaining a build-time fallback page. Added a native reload form and visible
fallback/stale warnings on home and above the calculator. The calculator separates
rate effective date from latest observation, propagates staleness, and no longer
presents the static decision calendar as current source data. Empty rate cells
and non-finite CPI data are rejected.

Verified by the opt-in `npm run check:data` integration command; the report is
stored in MARKET_DATA_CHECK.json. As checked September 13 Israel time:
- BOI rate: 3.25%; effective September 3; latest observation September 12.
- Derived prime: 4.75%.
- CPI: July 2026, monthly change +0.3%, index 105.1.
- Forecast: August calendar curve, published September 2; nominal/real each 360
  maturities and CPI index 361 points.
- Makam: August 2026, 3.2400288018% anchor.
All sources were live, passed freshness checks and reported no errors. This is a
point-in-time verification, not a guarantee of future provider availability.
BOI decision announcement: https://www.boi.org.il/publications/pressreleases/01-09-26/

Expanded learning into 26 bilingual concepts in five categories, searchable with
quote-insensitive text matching. Each concept has a short explanation and an
expandable example. Covers loan structure, budget ratios, rates, indexation,
schedules, forecasts, refinancing and costs, with official source links.

Automated verification: 484 offline tests passed; one opt-in network test passed
separately; TypeScript/build passed; 25 route checks passed; lint zero errors and
seven pre-existing warnings. No manual browser checks were performed.

Rendered production HTML was also checked automatically, with serialized script
payloads excluded: home displayed 3.25% BOI, 4.75% prime, three live source cards
and a live forecast; the prime calculator displayed the current rate without a
fallback warning. Both learning locales rendered 26 concept articles and search.

## September 13: daily server snapshots (supersedes per-page upstream fetch)

All four official datasets now use a persistent Next Data Cache entry with a
86,400-second lifetime: BOI rate, CBS CPI, parsed forecast workbook history plus
publication schedule, and parsed Makam history. Only successfully parsed and
validated data enters the cache; fallback handling remains outside it. Raw
network fetches bypass the HTTP data cache because the parsed result already has
a single daily lifetime. Requests in the same worker coalesce while loading.

Home renders dynamically from the stored data, avoiding a separately cached
fallback page. Historical curve/Makam selection happens after reading the shared
history, so different query parameters do not cause independent upstream pulls.
Source check timestamps are saved with the values and survive reloads; expired
rate/CPI snapshots are marked stale. In page rendering, failed background cache
revalidation retains the previous successful value. Bundled fallback is used
only when no successful cached result is available.

Refresh is demand-driven: the first request after 24 hours starts background
revalidation while the stored result is served. No scheduler or cron job has been
deployed. Multiple self-hosted replicas would require a shared Next cache handler
or shared storage; the current single-server installation persists in Next's
Data Cache across restarts. This does not promise one global fetch across
independent deployments.

Verification: 485 offline tests passed; TypeScript/build passed; all 25 route
checks passed. Actual persisted entries for all four datasets carry an 86,400s
TTL. Final repeated-request/restart checks confirm timestamps are reused.

## September 13: all home-page fields reviewed

Compared the actual server-rendered home content (excluding script payloads)
with fresh official-source responses. CPI July 2026 is the newest observation
returned by CBS as of this check; the July release was published August 14.
The month is the measurement period, not our last server refresh date.

| Home field | Verified value / meaning |
| --- | --- |
| BOI rate | 3.25%; effective September 3, latest observation September 13 |
| Prime | 4.75%; derived BOI rate + 1.5 percentage points |
| Monthly CPI | July 2026, +0.3%; current-base index 105.1 |
| Active forecast | August 2026 calendar average, published September 2 |
| 12-month CPI expectation | +1.42% from the active curve; distinct from observed CPI |
| Source checks | Actual fetch timestamps retained in the daily server cache |
| Home overview | Definitions of initial payment, forecast maximum and total payments |
| Tools | Calculator, 26-concept learning area, authenticated scenario saving |

Updated Hebrew and English cards to distinguish effective dates, observation
months and source check times. Display the CPI index value and explain its
publication lag. Forecast now also shows effective date and actual source check.
Removed the page-assembly timestamp, which could be mistaken for a data refresh.
Fallback observation labels no longer imply a current official observation; stale
labels no longer claim that the provider is currently available. No fixed date
or rate was inserted into UI copy. Daily caching remains unchanged.

Official CPI release:
https://www.cbs.gov.il/he/mediarelease/Madad/DocLib/2026/257/10_26_257b.pdf
Fresh machine-readable check: MARKET_DATA_CHECK.json (September 13, 17:18 UTC).

Validation for this display update: production build including TypeScript passed;
component lint passed; 25 automated route checks passed. Automated HTTP checks
of the rebuilt home in Hebrew and English confirmed all five displayed market
values, three live source cards, a live forecast, and four source timestamps.
No manual browser/UI checks were performed. Local preview restarted on port 3101.

## September 14: production deployment audit

Identified the existing production site as https://mortgage-mentor-fawn.vercel.app
from GitHub repository metadata. Main is connected to Vercel project
`nissim1/mortgage-mentor`; the previous deployed commit was dfe0043. All session
changes were still local, so Vercel had not received the updated calculator,
design, learning content or daily market cache. Publish through the existing Git
integration; no new Vercel project or database migration is required.

Supabase is already used for authentication and `public.mortgage_scenarios`,
with per-user RLS in the existing migration. The deployed public client and local
configuration reference the same Supabase project. A read-only table availability
probe (limit=0, no user records) failed at DNS resolution on September 14. This
is a separate existing backend connectivity issue; no database writes or schema
changes were attempted. Market snapshots currently use the Next Data Cache, not
a Supabase table or scheduled database job.

Pre-deploy verification: 485 offline tests passed (one optional network test
skipped). Latest production build, TypeScript, component lint and all 25 route
checks passed in the preceding home-page update; no application code changed
since that build. No manual UI checks.
