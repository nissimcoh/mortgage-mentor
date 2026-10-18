# Additional tests and scalability review — 2026-10-18

## Implemented

The calculator now updates its input query string through Next 16.2.10's
supported native History API for ordinary local calculations and track edits.
This avoids a server-component render and proxy/session check for every
calculation, add, remove, duplicate or clear. A draft recovery still uses server
navigation to resolve pinned market history. The first action after a change of
Israeli calendar date also uses the server router so a long-lived tab does not
retain an old day's market context indefinitely. While a refresh is pending,
subsequent URL updates stay on the router so an older response cannot overwrite
a newer local history entry. On receipt of new market props, local URL updates
resume. The trusted edit context and its concurrency token remain captured.

The server save pipeline now uses the same BOI-only rate snapshot as the
calculator. It no longer awaits an unused CBS CPI observation. Calculations,
source validation, historical references, server-side recomputation of saved
results and authenticated ownership checks are unchanged.

The installed Next documentation was read before this change:
`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`,
Native History API section. No auth settings, schema, data, region or deployment
was changed. Earlier local changes remain in place.

## Verification

- 21 added tests cover cache bursts/failure recovery/source isolation, draft
  corruption and authorization-field rejection, query normalization, subscriber
  cleanup, download-failure cleanup, Hebrew CSV round-tripping through ExcelJS,
  dialog retry/duplicate prevention, server save calculations and local URL
  updates including Israeli-midnight refresh and pending-navigation behavior.
- 687 offline tests passed, with the optional network test skipped in that run.
  The official-source integration test also passed when run separately against
  BOI and CBS. Production build and TypeScript passed. All 27 route smoke checks
  passed; ESLint has no errors or new warnings (seven existing warnings).
- A per-worker cache test starts 200 overlapping cold reads and observes one
  loader invocation. A rejected burst of 100 reads shares one failure, then the
  next read recovers. These tests bypass framework storage: they do not establish
  distributed locking or test the real Next persistent cache's TTL behavior.
- Chrome recorded zero non-prefetch calculator RSC navigation requests during
  10 recalculations, one duplication and another recalculation. Reload restored
  both tracks and the latest rate from the URL. Draft recovery generated one
  RSC navigation and preserved a partial rate string. Hebrew-to-English
  navigation retained the query and offered recovery of the partial draft.
- Browser mutations remain synthetic/local. Live authenticated save/delete
  operations and multi-user RLS load were not exercised.

## Bounded local HTTP diagnostic

Reproduce after a build: `node scripts/load-local.mjs`.
The script starts and stops its own loopback-only production server on port
3202. It never accepts a remote target. Each of three routes gets 24 requests at
concurrency 1, 8 and 16: 216 measured requests, after sequential warmup. It reads
the entire response and checks status/content. Report:
`/tmp/mortgage-local-load.json`. An initial run overlapped route smoke checks;
the values below are from the subsequent run without those checks running.

| Route | p95 complete, concurrency 1 | p95 complete, concurrency 8 | p95 complete, concurrency 16 | Decoded response size |
|---|---:|---:|---:|---:|
| Hebrew home | 9.26 ms | 42.94 ms | 72.75 ms | 46,574 B |
| Empty English calculator | 9.45 ms | 39.75 ms | 73.33 ms | 53,555 B |
| Shared five-track, 30-year fixed mix | 14.91 ms | 86.61 ms | 161.91 ms | 439,685 B |

All measured requests passed. This is one local Node 24 production process with
existing source-cache state, no real users, sessions, mobile network, Vercel
cold starts or database activity. Warmup is not a deliberately flushed cold-cache
measurement. The small sample, local hardware and load-generator contention
make these diagnostics unsuitable for a production capacity promise. The large
shared response is decoded HTML/RSC size, not compressed network transfer size.

## Priorities before substantial traffic

| Priority | Repository evidence | Proposed next change |
|---|---|---|
| 1 | `compare/page.tsx` loads scenario payloads without pagination; `loadComparisonScenarios` reconstructs every loaded schedule although the UI selects only 2–3. Work and serialized payment arrays grow with the user's saved collection, up to the API response limit. | Load a paginated metadata picker, then fetch/reconstruct only the selected 2–3 scenarios through the caller's RLS-bound client. Preserve historical-reference and saved-result validation; do not put private results in a shared cache. |
| 2 | `saved/page.tsx` has no pagination; `admin_usage_snapshot` returns all user aggregates. | Add bounded pages with deterministic ordering/cursors, keeping counts separate from row lists. Test ties, missing/foreign IDs and concurrent inserts. Avoid retrieving scenario JSON for picker/list rows. |
| 3 | Cold-source coalescing is scoped to one worker; each new worker can still download and parse workbooks. | Evaluate a scheduled, validated refresh of public market snapshots into shared storage/cache. Retain the last successful snapshot, do not persist dated fallbacks as successes, and keep request-time Israeli-date activation. Load-test simultaneous cold workers and provider failures. |
| 4 | A five-track shared page returns about 429 KiB of decoded content, including a full 360-month table. | Measure whether incremental table rendering or a small initial row window improves mobile transfer/rendering; preserve access to every month, keyboard behavior, CSV and print output. |
| 5 | Local anonymous HTTP tests do not exercise Supabase traffic or public abuse. | In a staging environment with synthetic accounts, measure p50/p95/p99, error rate, function CPU/memory, cache hit rate and DB/Auth request latency for realistic browse/calculate/save/compare sessions. Add measured per-user write throttling and request-size limits where needed. Avoid logging calculator query strings or financial payloads. |

Vercel can scale concurrent functions, but that alone does not bound work per
request or establish downstream database/provider capacity. See
[Vercel concurrency scaling](https://vercel.com/docs/functions/concurrency-scaling).
Use measured query plans and usage before choosing indexes or larger database
compute; see [Supabase query optimization](https://supabase.com/docs/guides/database/query-optimization).

## Infrastructure evidence

The `mortgage` connection freshly confirmed `keuzhzdkuixyevaszjto` is
`ACTIVE_HEALTHY`, region `ap-southeast-2`, Postgres 17.6. Performance advisors
still show three unindexed role/audit foreign keys, an unused scenario index and
overlapping permissive scenario SELECT policies. These notices alone do not
establish a bottleneck. Keep the existing `(user_id, updated_at desc)` scenario
index; an unused flag under light traffic is not a reason to drop it.

Advisor references:
[foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index),
[overlapping policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).
RLS and index changes require their own measured review and tests; none were
made here. App/database region experiments and OAuth changes remain deferred.
