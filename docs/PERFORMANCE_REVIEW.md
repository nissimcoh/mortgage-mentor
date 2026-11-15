# First-load performance review — 2026-10-16

## Implemented locally

The home page used to await the official rate, CPI and forecast sources before
rendering its hero and calculator entry point. A cold parsed-data cache could
therefore delay the main content while sources were downloaded and decoded.

The home now streams the market section inside its own Suspense boundary.
The hero, calculator link and tools render while that section is pending.
Its localized loading state shows placeholders rather than financial values,
and respects reduced-motion preferences. Completed cards still use the same
source data, timestamps, fallback labels and freshness checks. Request-time
evaluation is retained inside the market section; fallback HTML is not made
into a static home page.

This changes time to useful home content. It does not reduce upstream fetch
duration, change the 24-hour source-cache policy, or add a scheduled updater.
No production deployment was made.

The continuation also removes the calculator's dependency on the latest CBS
CPI observation. That value was fetched and awaited but never used by
`buildCalculatorMarketData`; CPI-linked calculations use the official forecast
curve's expected CPI index. The calculator now requests only the BOI rate and
retains the same rate fallback, source-check time, staleness and next-decision
derivation. The home still loads both BOI and CBS.

Forecast workbooks are now joined, ordered, validated and assigned banking-day
effective dates once per successful daily cache refresh. The cached history
includes published curves that are not yet effective. Each request still
filters against the current Israeli date, so a new curve activates at Israeli
midnight even when the cache was populated before activation. Historical pins,
missing-ID reporting and original fetch timestamps are retained. Invalid or
future-only workbooks do not replace a successful cache entry. The cache key
was versioned because its payload changed; the first request after deployment
will populate a new cache entry. Upstream downloads and XLSX decoding remain
on the cold path.

Reproducible CPU benchmark: `npx vitest bench --run scripts/forecast-selection.bench.ts`.
For 240 synthetic curves, previous per-request preparation plus validation
averaged 0.8493 ms; prepared-history activation averaged 0.0022 ms. This is a
small absolute CPU saving, not an end-to-end speedup claim. The benchmark
excludes cache I/O, network latency, workbook decoding and browser rendering.

## Infrastructure evidence and access

- Supabase connection **mortgage** successfully read project
  `keuzhzdkuixyevaszjto`: `ACTIVE_HEALTHY`, region `ap-southeast-2` (Sydney),
  Postgres 17.6. This supersedes the earlier connector permission failure.
- Read-only aggregate database inspection at 07:36 UTC showed one active and
  six idle sessions, plus one session without a state. Public-table statistics
  reported zero live tuples and very few scans; these are estimates, not exact
  counts. A bounded query-statistics sample containing `mortgage_scenarios`
  had 1–10 calls per statement and mean execution times below 17 ms; it includes
  administrative statements and is not representative application latency.
  No statement text, user records, credentials or session tokens were fetched.
  No database logs or authenticated application flows were measured.
- Performance advisors reported three unindexed foreign keys in role/audit
  tables, one unused scenario index and overlapping scenario SELECT policies.
  The sample does not justify dropping the existing index or changing RLS.
  No schema, index, data or authorization changes were made. Advisor references:
  [foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
  [unused index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index),
  [policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).
- Vercel connector access works using its existing account context. Explicitly
  supplying the discovered team ID returned 403; omitting that optional scope
  successfully retrieved the same project and deployments. No reauthentication,
  project linking or account-setting changes were needed; no Vercel CLI is
  installed locally.
- Live Vercel project: `mortgage-mentor`, ID
  `prj_lHC84u5qz4upLk7GmTa5V8fJCFv0`. The latest production deployment is
  `dpl_99ACDPTC1UeCiLRNy4xMHTtoXbAy`, `READY`, from main commit
  `b0c0d6a92e64be6af4fad8f547c46113863d2c18`. Its deployment metadata confirms
  function region `iad1` (Washington). This is deployment evidence, not a claim
  about the current project default. Earlier HTTP headers showed `fra1::iad1`.
  [Deployment](https://vercel.com/nissim1/mortgage-mentor/99ACDPTC1UeCiLRNy4xMHTtoXbAy).

## Validation

- Production build and TypeScript passed.
- 649 offline tests passed; one optional network test skipped. This includes
  two streaming regressions that hold both official-source promises pending,
  verify the Hebrew/English home entry points are sent, and then release the
  sources and verify that the completed data is streamed.
- New source tests use real in-memory XLSX workbooks and a serialized cache
  double to check activation across Israeli midnight without refetching,
  historical pins, missing IDs, timestamp preservation, and retry after an
  initially future-only workbook. Calculator tests hold CBS pending, verify
  the calculator completes independently, and retain the dated rate fallback.
- All 27 existing production route smoke checks passed.
- ESLint: no errors; seven existing warnings outside the changed files.
- The earlier home-streaming production build was checked in a real browser at a 390px mobile viewport.
  Hebrew and English source cards render, the Google verification meta tag is
  retained, and no horizontal overflow or browser console errors were observed.
- These checks are not production mobile performance measurements or an
  authenticated login test.

## Next priorities

1. Publish this change through the existing deployment workflow and measure
   initial and repeat visits from an Israeli mobile connection. Separate server
   response, visible content and calculator readiness measurements.
2. Connector access and live regions are now verified. Measure request latency
   for authenticated saved-scenario flows separately from database execution
   time before choosing infrastructure or changing indexes/policies.
3. Evaluate a scheduled refresh of validated market snapshots, keeping the last
   successful values available when providers fail and selecting active curves
   using the existing Israeli calendar rules.
4. Sydney is confirmed. Database relocation and authentication-setting changes
   are explicitly deferred by the user. Any future regional experiment needs
   separate authorization and planning; no migration or callback changes are
   part of this continuation.

References:
- https://vercel.com/docs/functions/configuring-functions/region
- https://vercel.com/docs/headers/request-headers
- https://supabase.com/docs/guides/platform/regions
- https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z


## Calculator follow-up — October 18, 2026

See [CALCULATOR_REVIEW.md](CALCULATOR_REVIEW.md) for safe amount editing,
accessible field errors, full monthly Leumi comparisons, the corrected Makam
baseline and CPI forecast precision. Calculator audit version is now 1.2.0;
existing saved result snapshots were not rewritten. The offline suite passes
733 tests, production build and all 27 smoke routes pass. Real-account
save/reopen/edit/save-as-new/compare was verified against Supabase; only the two
synthetic QA records were created and then removed. The local OAuth redirect
required routing the valid code to the intended callback without changing auth
settings. Supabase `mortgage`
and Vercel project read access were rechecked; no deployment, database move,
schema change or authentication configuration change was performed.


## Final pre-push verification — October 18, 2026

See [PRE_PUSH_REVIEW.md](PRE_PUSH_REVIEW.md). Repeated saves now advance the
server-issued concurrency token and saved name; source failures have a
120-second worker cooldown; refreshed auth responses retain the SSR SDK's
private/no-store headers even on locale redirects. 743 tests, TypeScript,
ESLint, the production build and all 27 smoke routes pass. Real authenticated
repeated save/rename, copy and comparison flows passed; synthetic rows were
removed and existing rows preserved. Authenticated comparison/admin and
localized 404 layouts were checked at mobile/desktop widths.

## Safari home-screen icon — October 19, 2026

An iPhone screenshot showed Safari's fallback M monogram. Production already
served the correct opaque 180×180 PNG through Next's generated Apple icon link,
including in the initial head for an iPhone user agent, but the conventional
`/apple-touch-icon.png` discovery URL returned 404. This does not establish why
the existing shortcut missed its icon.

The same logo now lives at the conventional root URL, with one explicit Apple
icon link in both locale layouts. The old `/apple-icon.png` URL (including cached
query strings) remains available. The asset generator produces both copies;
the logo artwork and browser launch behavior are unchanged.

Validation: production build including TypeScript, ESLint, 743 offline tests
(two opt-in tests skipped), all 27 route smoke checks, and a new production
smoke check of the initial Hebrew/English head sent to an iPhone user agent,
PNG response type, opaque RGB pixels, dimensions and legacy URL compatibility.
Native iPhone Add to Home Screen still requires a device recheck; an existing
shortcut may need to be recreated after publication.

The user subsequently reported the icon works on their spouse's stable iOS 27
device but still fails on their own iOS 27.2 beta device. This narrows the
remaining investigation to device/version differences without establishing a
specific Safari bug. At the user's request, the default home-screen name follows
the page language: `מנטור משכנתא` for Hebrew and `Mortgage Mentor` for English.
Both Apple title and application-name metadata use the locale dictionary,
while retaining the existing localized page titles and launch mode.


## Redesign and home page caching — November 12, 2026

Measured from Israel against production before this change (three requests
each, `curl`): pages rendered per request answered through `fra1::syd1` with a
time to first byte of 560–740 ms (`/he`, `/he/calculator`, `/he/signin`);
prerendered pages answered from `fra1` alone in about 250 ms (`/he/learn`,
`/he/privacy`). The TLS handshake accounts for roughly 150 ms of both.

The home page never reads the database, so it no longer needs to run in the
functions region. It is now prerendered and revalidated every five minutes
(`export const revalidate = 300` in `app/[locale]/page.tsx`); the `connection()`
call that forced per-request rendering is gone. This reverses the October 16
decision recorded above ("fallback HTML is not made into a static home page"),
at the owner's request. What changes:

- Freshness status, staleness and the active forecast curve are evaluated when
  the page is rebuilt, not on every request. They can lag by the revalidation
  window.
- Revalidation is stale-while-revalidate: after a quiet period the first
  visitor receives the previous copy while the rebuild runs. `HomeFreshness`
  (client) notices a copy older than the window and refreshes the route a few
  seconds later, at most twice.
- If the official sources fail during a rebuild, the dated fallback values are
  served until the next rebuild, labelled as fallback as before. Source
  responses are still cached for a day and failures are never cached.

Not changed: the functions region (`syd1`), the database region, and per-request
rendering of the calculator, sign-in and all signed-in pages. Per-route regions
are not available for Node.js functions through `preferredRegion` on Vercel,
and Cache Components would turn the 307 redirects of protected pages into
client-side redirects, so neither was used.

The same change set fixes a hydration mismatch on shared calculator links
(`AnimatedNumber` rendered 0 on the client against the server's figure, React
error 418, which made React rebuild the page in the browser), removes
`backdrop-filter` from all cards, and stops preloading the web font (Apple
devices use the system face and never request it). Local Chrome measurements
with mobile emulation and 4x CPU throttling: home LCP 124 → 64 ms, learn
104 → 76 ms, calculator unchanged within noise. These exclude network latency
and are not production measurements. The home page gained content: about 8 KB
more HTML and 8 KB more JavaScript, compressed.

Validation: 785 offline tests, TypeScript, ESLint, production build and all 27
route smoke checks pass. Signed-in pages were restyled but not viewed with a
signed-in account in this pass.

## Market data review — November 15, 2026

A check of the official feeds and how the app uses them. All four sources were
live and current on the day (`npm run check:data`): Bank of Israel rate 3.25%,
CPI for September 2026, the October 2026 forecast curve (published November 2)
and the October 2026 Makam anchor. Three defects were found and fixed:

- **Wrong "effective from" date for the Bank of Israel rate.** The date is the
  start of the newest run of identical daily values, but only 60 days were
  requested. With the rate unchanged since September 3, the site showed
  September 17, the first day of the window, and the date moved forward daily.
  The same date is stored with saved scenarios and is part of the signature the
  comparison page uses to tell whether prime tracks share market data, so two
  mixes saved on different days could look like they used different data. The
  request now covers 2,000 days (about 115 KB, once a day).
- **A false "may be out of date" warning for the first visitor after a quiet
  day.** On per-request pages (the calculator) the Data Cache returns an
  expired entry at once and refreshes it in the background, so that visitor
  received yesterday's snapshot, which the app then flagged as stale.
  `dailyServerCache` now joins that refresh for up to four seconds and falls
  back to the previous value only if the source fails or is slow. Prerendered
  pages already waited for the refresh.
- **Invisible status dots on the home market cards.** The dot had no size
  because it was an inline element, so a stale or fallback figure showed no
  marker on its tile (the banner above the cards still appeared).

Also updated: the dated fallback values for the rate and the CPI (verified
against the sources that day), and the list of rate-decision dates, which had
run out on September 1 and so hid the "next decision" line. The list now runs
to April 2028, copied from the Bank of Israel's published schedules. The
fallback forecast curve (June 2026) and Makam anchor (June 2026) were left as
they are: they are used only when the live source and the cache both fail, are
labelled with their date, and several tests pin them.

The home page shows the four headline figures again directly under the hero,
in a small strip that reads the same snapshot as the full cards further down.

Validation: 803 offline tests, TypeScript, ESLint, production build and all 27
route smoke checks pass.
