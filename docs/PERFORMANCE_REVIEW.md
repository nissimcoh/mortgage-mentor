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
