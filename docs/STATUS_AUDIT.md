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


## October 6: bank comparison and forecast activation fix

Compared the user's October 5 screenshots from Leumi, Mizrahi Tefahot and
Hapoalim. After the user corrected Leumi's unlinked rate to 4.5%, our
500,000 ILS / 240-month / five-year-reset scenario matches its four headline
values at the displayed precision. Added an offline regression with the
original `2026-09-index` yields frozen. Differences versus Mizrahi/Hapoalim
remain unresolved; details and the minimum follow-up are in
[the bank comparison](reviews/2026-10-05-bank-comparison.md). This is not
validation of every mortgage product or the full monthly schedule.

Production still selected the old curve at 01:28 Israel time because it used
the UTC date. Fixed date selection to use `Asia/Jerusalem`. Also corrected
the next-business-day calculation: Fridays count; Saturdays, banking holidays
and maintained election closures do not. Recurring holidays use the Hebrew
calendar; exceptional closures still require maintenance when announced.
Verified all dates against BOI's 2026 and 2027 banking calendars.

Fresh source check at 01:32 Israel time on October 6:
- BOI rate 3.25%, effective September 3, latest observation October 5.
- Prime 4.75%.
- CPI August 2026: monthly +0.7%, index 105.8.
- Active forecast `2026-09-calendar`, published October 5, effective October 6.
- September Makam anchor 3.1935502937%.
- All sources live, no reported errors.

Machine-readable evidence: [source check](reviews/2026-10-06-market-check.json).
Daily upstream caching remains unchanged; choosing which cached curve is active
is evaluated per request. No Supabase schema changes are needed for this fix.
Validation: 544 offline tests passed, the opt-in live-source check passed,
production build/TypeScript passed, lint had no errors (7 existing warnings).
No manual browser/UI tests were performed.

Deployment: calendar-only commit `6d622ee` was pushed to main; Vercel reported
success. Automated HTTP verification of the public Hebrew home confirmed live
September 2026 calendar forecast, publication October 5, activation October 6,
and 12-month CPI expectation +1.72%. The cached fetch timestamp remained 01:28,
confirming activation changes without refetching the workbook.
All 27 automated route checks passed against the local production build.
Screenshot-derived bank evidence and its regression fixture remain local: the
automatic approval review rejected publishing those files to the public GitHub
repository. They were removed from the unpublished commit before the successful
calendar-only push. Other pre-existing design/admin edits remain uncommitted.


## October 6: schedule certainty and rendering performance

Deployed `8772285` successfully through Vercel. Schedule rows now identify
entered contractual terms (green) versus rate/CPI-dependent estimates (amber),
with written badges and a legend in Hebrew and English. Fixed unlinked stays
green; government-bond/Makam changes after the initial reset period; prime and
CPI-linked start estimated. Combined rows account only for active tracks.
Constant/stress assumptions never turn forecast-dependent periods contractual.

Performance: memoized schedule/selector/notes/classifications and timeline;
chart geometry is reused while scrubbing, formatters are reused, and input
curve serialization runs only after a new calculation. Removed backdrop blur
from the scrolling table and reduced mobile glass blur to 12px with no fixed
body paint/noise layer. Daily data caching remains unchanged. A local fix also
keeps the pre-existing glass-nav style from overriding fixed positioning;
that competing local style was not part of the published baseline.

Validation: 558 offline tests passed; production build/TypeScript passed;
modified components/domain code lint clean. Twelve automated local HTTP cases
verified exact row counts and legends across both languages, including a
combined scenario whose indexed track ends before its fixed track. Production
HTTP confirmed the legend and month-61 transition in both languages. No manual
UI tests or on-device performance measurements; perceived phone responsiveness
remains for the user to assess. Two proposed product additions (saved-scenario
comparison and a user-defined monthly-payment ceiling) have not been implemented.


## October 6: saved-scenario comparison

Implemented and deployed `c771252`. Saved now links to /[locale]/compare.
Signed-in users can compare two or three of their own saved scenarios by first
payment, forecast maximum and its month, total payments, financing cost, loan
amount, maximum term and principal exposure to rates/CPI. Deltas use the first
selected mix as the baseline. Results retain their saved calculation date and
are explicitly historical snapshots, with warnings for different amounts/terms,
forecast references or custom assumptions. Variable-linked principal counts in
both exposure dimensions; explanatory copy prevents summing these percentages.

The page uses a session-bound Supabase client plus the owner filter and existing
RLS. No schema migration, writes, fresh market fetching or recalculation is
needed for comparison. Only validated compact projections cross to the client.
Error, invalid-row and fewer-than-two-scenarios states are handled.

Validation: 567 offline tests, TypeScript/build and 27 automated route checks
passed. New tests execute the authentication/query ownership flow using mocks
and render the comparison with synthetic records. Lint has no errors and only
the 7 pre-existing warnings. Vercel reported success; production Hebrew/English
HTTP requests redirect unauthenticated comparison visitors to sign-in with the
comparison return path intact. No manual account/browser testing was performed.
The user should verify selection of two/three real saved records after login.

Fresh source check at 22:13 Israel time: 2026-09-calendar remains active,
published October 5 and effective October 6; BOI 3.25%, prime 4.75%, observed
August CPI +0.7% / 105.8, September Makam 3.1935502937%, all sources live.
Remaining bank checks: Mizrahi and Hapoalim, both five-year government-bond
unlinked and five-year CPI-linked, each 500000 ILS / 240 months / Spitzer /
4.5%; Leumi unlinked as a same-day control. Capture inputs plus first/max/total/
overall forecast rate and, if available, forecast date and months 60-61.
Compare with a new calculation using the active official curve, not directly
with the historical October 5 screenshot set.

Only the first requested proposal was implemented. New proposals, not yet
authorized or implemented: export a dated PDF summary; show rate-reset and
track-end milestones on the payment timeline.

## October 7: printable summary, milestones and read-only administration

Both subsequently authorized proposals are implemented and deployed in
`4901715`. The calculator exports a dated Hebrew/English summary through the
browser print dialog (Save as PDF), including submitted inputs, results and
forecast assumptions. Export is disabled when inputs differ from the displayed
calculation. The report loads on demand. The payment graph now marks scheduled
rate resets and final payments, with an accessible milestone selector. A
five-year reset first appears at payment 61; no reset is invented for prime.

Existing local admin work was found. Published a read-only users/scenarios
overview at /[locale]/admin and an account-menu link shown only after a positive
admin permission response. The server independently checks authentication and
requires the admin RPC result to be exactly true before requesting records.
No deletion controls, database migrations or permission changes were deployed.
The previously unreachable Supabase host is reachable again. Anonymous bounded
RPC probes returned errors and no user/scenario records. Actual owner-session
access remains for the user to verify.

Validation: 583 tests passed, one optional network test skipped; production
build/TypeScript passed; lint has zero errors and seven pre-existing warnings.
Vercel reported deployment success. Production HTTP checks verified export and
milestone content in both languages and sign-in protection for admin routes.
No manual browser, print-layout or phone tests were performed.

The October 6 screenshot comparison is retained locally in
docs/reviews/2026-10-06-bank-comparison.md. Both Leumi variable-track totals match
our calculation within one shekel at the displayed precision. Mizrahi and
Hapoalim differ; aggregate screenshots alone do not establish why and do not
justify changing the engine. Bank evidence and private fixtures were not
included in the published commit.

User checks: save a Hebrew calculation as PDF and compare its inputs/totals;
jump to payment 61 and a final-payment milestone; sign in with the admin account
and open the account-menu administration link. To investigate the remaining
bank differences, capture payments 60–61 (payment, rate and balance), forecast
date, and the full Hapoalim unlinked product label when available.

## October 8: privacy, terms and collection notices (local draft)

Added Hebrew/English privacy, terms and accessibility information pages, a
shared footer, notices before Google sign-in and saving, and a calculator-link
disclosure. Added no-referrer headers to reduce exposure of calculation URLs
through Referer, plus nosniff. Save dialogs now scroll within the viewport.
Details and outstanding operational/legal review are in docs/LEGAL_READINESS.md.

These changes are NOT deployed: the operator's public name and contact email
are still awaiting the user's reply. The legal config remains empty rather than
inventing an identity; pages display a draft notice and noindex metadata.
Google consent branding remains unchanged pending access to its console.

Validation: build/TypeScript passed, 583 tests passed (one optional network test
skipped), lint has zero errors and seven pre-existing warnings. Six automated
local HTTP checks confirmed Hebrew/English legal pages, footer links, draft
metadata and no-referrer headers. No manual browser/accessibility audit was
performed; the accessibility copy explicitly states that limitation.

## October 8: administrator usage overview

User requested operational account statistics instead of browsing scenarios.
Commit `a770a8d` replaces the scenario list with a user dashboard: joined date,
last sign-in, last update to a currently saved scenario, per-user saved count,
recorded-activity age/status, totals, email search and filters. An optional
review flag identifies accounts at least 180 days old, with no saves and no
recorded activity in 180 days, excluding the current administrator. No deletion
action or automatic cleanup was added.

The page continues to require server-side admin authorization. Existing RPCs
are called with explicit projections: users expose only id/email/joined/sign-in;
scenario metadata exposes only user_id/updated_at. Names, financial inputs and
results are not requested or rendered. Metadata is paginated with exact counts
and aggregated on the server; incomplete, invalid or changing totals produce
an error rather than misleading zero counts. No new tracking or database
migration was introduced, and existing database permissions were not changed.

The UI explains that this is not last-visit tracking: existing sessions,
unsaved calculations and deletions are not measured, and deleted scenarios no
longer contribute activity timestamps. Review flags are not proof of inactivity
or authorization to delete an account. Account-level activity can still be
incomplete despite complete pagination of retained metadata.

Validation: 588 tests passed (one optional network test skipped), build and
TypeScript passed, changed admin files lint clean. Tests cover access denial,
metadata-only rendering, threshold cases, 1,001 saved records and fail-closed
partial reads. Production account UI remains for the user to check manually.
The privacy draft was updated locally to describe aggregate-only admin UI and
remains unpublished pending operator/contact details.

Vercel confirmed successful deployment of `a770a8d`; production HTTP checks
confirmed both Hebrew and English admin pages require sign-in.

## October 8: privacy publication and Google branding follow-up

Operator confirmed public name ניסים כהן and that all services are completely
free. Updated the local legal config and bilingual terms accordingly. The
contact mailbox remains pending, so policy pages are still unpublished. The
user chose to make Google console changes personally; setup instructions are
in docs/GOOGLE_BRANDING_SETUP.md. No browser access or branding mutation was
performed.

Published `2de9316` (next.config.ts only): no-referrer and nosniff response
headers. Vercel deployment succeeded and production HTTP verified both headers
on Hebrew/English sign-in pages. Automated OAuth redirect inspection confirmed
Google as provider, the default Supabase callback domain, and email/profile
scopes. This does not verify a complete signed-in session or Google's public
brand verification status. Legal-page lint passed after the text updates.

## October 9: approved public support contact and policy release

Operator chose the existing Google support email for free website support and
privacy requests. Config now contains the approved public operator/contact,
dated October 9; bilingual terms confirm the service is entirely free. Added
a mailto support link to the shared footer. Commit `7bb702f` publishes privacy,
terms and accessibility pages plus sign-in/save/share collection notices.

The first push was rejected because website publication consent did not
explicitly cover the public GitHub repository. The user then explicitly
authorized publication of both the name and email in that repository; the
authorized retry succeeded. No domain or paid email service was purchased.

Validation: build/TypeScript and 588 tests passed, one optional network test
skipped; lint has zero errors and seven pre-existing warnings. Eight automated
local HTTP checks validated the six legal pages' name/contact/current date and
absence of draft notices, plus Hebrew/English sign-in notices and footer links.
No email was sent, and no manual browser/accessibility audit was performed.
Legal/accessibility professional review remains outstanding; publication is
not a certification of compliance. Google branding remains user-managed.

Vercel confirmed successful deployment of `7bb702f`. Nine production HTTP
checks passed: six legal pages, two sign-in pages and the Hebrew homepage,
including approved public contact links, current policy date, absence of draft
notices and the expected collection/footer links.

## October 9: Google Search Console verification tag

Added the owner-supplied public Google verification token to the locale layout's
Next.js metadata, commit `7e5776b`. Markdown escape characters from the pasted
HTML were not included in the token. Build/TypeScript and targeted lint passed;
automated HTTP checks using Google's site-verification user-agent confirmed
the exact meta tag in the head of / (after redirect), /he and /en locally.
Only the three metadata lines were committed; existing unrelated layout color
work was preserved locally. The owner must still click Verify in Search Console
and, following the displayed Google instructions, wait 24 hours before retrying
branding verification. No Google account settings were changed by the agent.

Vercel confirmed deployment of `7e5776b`. Production HTTP checks passed for
/, /he and /en: the exact verification token is present inside head and is
accessible without authentication using the Google site-verification agent.

## October 9: Launch branding preparation

Commit `6b48492` adds an original house/M vector mark to the shared header and
printed report, replaces the default favicon, and adds an SVG browser icon and
180 px Apple touch icon. Downloadable PNGs are available in public/brand at
120, 512 and 1024 px, with the SVG master and a regeneration script. The Google
upload file is 120×120 and 2,850 bytes. No client dependency was added.

Build/TypeScript, 588 tests and targeted lint passed; the optional live-source
test was then explicitly run and passed. Sources fetched at 20:32 UTC on
October 9 returned BOI 3.25%, prime 4.75%, August CPI 105.8/+0.7%, September
Makam 3.1935502937%, and the 2026-09-calendar forecast published October 5.
There were no source errors/fallbacks. This upstream diagnostic does not audit
external cron configuration. Six production legal-page HTTP checks passed for
Hebrew/English privacy, terms and accessibility with the approved email and
no-referrer headers. No manual browser testing or Google console change occurred.

docs/LAUNCH_CHECKLIST.md contains owner upload/verification/publication steps,
phone smoke checks and remaining calibration/legal limitations. The 24-hour
wait is from successful Search Console ownership verification, and does not
guarantee approval of Google branding. The new logo should be uploaded before
retrying verification; only approved, published branding changes public consent
identity. The technical Supabase callback domain is unchanged.

Vercel successfully deployed `6b48492`. Nine production HTTP checks passed:
all seven brand/icon files matched the local binary/vector exports exactly,
and both locale homepages contained the new inline mark, icon metadata,
unchanged Google verification tag, policy links and approved support mailto.

## October 9: Repair administrator data loading and delayed menu link

The owner reported a delayed admin menu link and an error in the usage page.
The live database reproduced SQLSTATE 42804 in admin_list_users: auth.users.email
is varchar(255), but the PL/pgSQL RETURNS TABLE declaration requires text.
admin_list_scenarios had the same mismatch for owner_email. This was a database
function failure after successful authorization, not an empty user directory.

Migration 20261009210000 adds explicit email::text casts in both existing RPCs.
It requires the original functions to exist and preserves signatures, grants,
membership, RLS and deletion behavior. Tested first within a rolled-back
transaction, then applied using Supabase CLI after dry-run showed this was the
only pending migration. No users or scenario records were changed.

Live read-only post-migration SQL checks, under authenticated owner JWT claims,
confirmed both RPCs and the exact UI projections/order succeed and the owner is
present. Ordinary authenticated and anonymous callers were tested and denied.
Only counts/boolean results were returned to the tool, no user lists or scenario
contents. Anonymous execute grants existed already; internal authorization
denies the calls. The migration preserves this arrangement.

The account menu now starts its presentation-only permission request on signed-in
mount, before opening. React keys the component by account ID, so token-refresh
object changes no longer trigger repeat checks and switching accounts resets
permission state. Pending requests have a visible loading row; failures offer a
retry instead of silently hiding the link. The admin page still independently
authorizes every request. Commit 11052a0 contains these changes.

Validation: build/TypeScript and the complete test suite passed; the final
targeted admin/header suite passed 17 tests and changed files lint clean.
The live Supabase checks passed after applying the migration. No browser/UI test
or authenticated OAuth session was performed; the owner should refresh the live
site and confirm the account table and menu behavior.

Vercel confirmed successful deployment of 11052a0. Production HTTP checks for
/he/admin and /en/admin still redirect unauthenticated visitors to sign-in.


## October 10: finish and publish retained local improvements

The administrator page now loads one guarded scalar JSON snapshot, avoiding
PostgREST row/count-header limitations and collecting account/save aggregates
in one statement. Runtime validation rejects duplicate accounts, invalid dates,
unsafe counts, inconsistent totals and a missing current administrator; extra
fields never reach the interface. Accounts with no saves remain visible.
Migration 20261010001500_admin_usage_snapshot.sql creates only the read-only
RPC and its execute grants. The existing membership, RLS and deletion behavior
remain unchanged. Verified first within a rolled-back transaction, then applied
using Supabase CLI after dry-run identified this as the only pending migration.
Live post-application SQL checks confirmed owner access, correct complete
counts and denial for ordinary authenticated and anonymous callers. Only
boolean check results were exposed; no user lists were exported.

Retained the warmer glass design and primary-action styling while removing the
fixed texture/paint surface, retaining the existing desktop blur and 12px phone
blur, and preserving fixed/sticky navigation. Removed the secondary homepage
jump link. Clarified that displayed CPI expectations cover the first 12 forecast
months, rather than a calendar year; the curve averaging/source month is not
misrepresented as the forecast starting month.

Added the retained historical migration and dormant admin action/button files
to version control. The administration page remains read-only and no deletion
control is mounted. Action diagnostics now log only bounded codes, and the
unused control handles transport failures. No account/scenario deletion was
performed. The migration catalog confirms the historical admin-access migration
was already applied; it was not reapplied.

Published documentation for previously completed policy/branding work. Raw
screenshot evidence and historical diagnostic captures stay local under
ignored docs/reviews/. The public single-case regression uses synthetic
500,000 ILS / 20-year / 4.5% test inputs and a frozen official curve, without
attachment identifiers or local paths. It is not full bank calibration.

Validation: 603 tests passed, one optional network test skipped; lint has zero
errors and seven pre-existing warnings. Production build includes TypeScript
validation. Automated route checks cover all 27 routes. Live database
permission/snapshot checks passed. No authenticated browser session, manual
visual audit or on-device performance measurement was performed.


## October 10: roles and owner-controlled administrator assignment

Replaced runtime email allowlisting with protected account-ID role assignments.
Existing confirmed administrator was preserved as the sole Owner using the old
rule once during handover; the new migration contains no account email or ID.
Missing assignments default to User, including newly registered accounts.
Administrator gets the directory/aggregate usage screen; only Owner can grant
or revoke administrator access. The owner row has no role control and database
RPCs also reject changes to it. No real user was granted administrator access.

The usage page now displays roles in Hebrew/English. Owner-only controls select
User or Administrator, explain the access being granted, require confirmation,
handle errors and refresh on success. The recipient must already be registered.
Assignments validate the expected previous role to prevent stale overwrites,
serialize concurrent changes and record actor/target/old/new role in a protected
audit table. Role/audit tables deny direct authenticated and anonymous access;
server and RPC checks both independently enforce ownership. Authorization reads
current database assignments, so revocation needs no JWT role refresh. The
account menu rechecks its presentation result when opened while retaining the
prefetched result during that request.

Preserved owner-only legacy scenario listing/deletion and cross-owner scenario
RLS access. Delegated administrators cannot use those powers or change roles.
Ordinary scenario ownership policies remain unchanged. No deletion controls were
added, no existing account/scenario was deleted, and Owner transfer is not
exposed by this UI. Details: docs/ADMIN_ROLES.md.

Migration 20261010130000_dynamic_user_roles.sql passed a rolled-back live test
before application; dry-run identified only that pending migration. Supabase
CLI applied it successfully. Executable permission tests are retained in
supabase/tests/dynamic_user_roles.sql and use disposable accounts/scenarios with
rollback. Checks cover grant/revoke, default role, owner protection, invalid and
stale assignments, denied direct writes, metadata/email spoofing, email changes,
anonymous/non-owner denial, delegated-admin financial privacy and audit records.
Only boolean verification results were returned, not account or scenario lists.

Validation: 624 tests passed, one optional network test skipped; lint has zero
errors and seven pre-existing warnings. Production build/TypeScript and all
27 automated route checks passed. Server-render tests verify role controls for
Owner and their absence for Administrator. No authenticated browser session or
manual on-device interaction test was performed.

## October 10: monthly and cumulative payment comparison charts

Added two synchronized charts above the saved comparison table: forecast
monthly payments and cumulative payments. Two or three selected mixes retain
the same numbered colors in both charts and the table; dash patterns also
distinguish the lines. A shared keyboard-accessible month slider and pointer
selection compare all mixes at the same month. Both charts use the longest
selected term. After a shorter mix ends, its monthly payments are zero and its
cumulative total stays flat. Cumulative sums use integer agorot.

Saved rows contain summary metrics, not monthly schedules. The server therefore
reconstructs schedules with the existing engine using the recorded curve IDs,
Makam anchor IDs and BOI rate. It never substitutes the latest forecast or BOI
rate for saved context. Only the current calculator methodology is supported;
all saved payment metrics, maximum-payment month and cumulative final total
must match to displayed precision before a chart is shown. Missing/revised
historical data or an old methodology leaves that mix's line unavailable with
an explanation and a link to recalculate/save. Its saved summary remains in
the table. Market requests are batched; fixed-only lists need no market fetch.
Only verified monthly payment arrays are sent to the browser, without raw
drafts, full schedules or market curves. Authenticated user filtering and RLS
remain unchanged. No database migration or saved-row update is needed.

Hebrew and English explain that forecast month one may differ from the table's
first payment at the rates on the saved calculation date. Chart cards stack
on narrower screens and sit side by side on wide screens.

Validation: 643 tests passed, one optional network test skipped. Tests cover
all six track types, stress/constant assumptions, unpinned drafts resolved from
saved references, changed/missing historical data, methodology changes, cent
precision, shorter-term completion, batched/failing sources, bilingual chart
markup, accessible shared controls and retained summary tables. Lint has zero
errors and seven pre-existing warnings. Production build/TypeScript and all
27 automated route checks passed. No authenticated browser session or manual
on-device interaction test was performed.
