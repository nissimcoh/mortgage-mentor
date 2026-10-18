# Calculator usability updates — 2026-10-17

## Implemented locally

- Calculator inputs are saved to versioned `sessionStorage` on edits, including
  incomplete numeric strings. A matching draft is offered after a reload or
  language switch. Recovery is explicit and requires recalculation; it does
  not restore results or authorization metadata. Explicit different scenario
  URLs and different saved-scenario identities take precedence. Pinned market
  references are passed through the existing server-loading route on recovery.
  Discard removes only the stored draft; Clear resets the calculator and draft.
  Storage denial leaves calculation usable and shows a localized notice.
- The amortization section exports its currently selected combined or individual
  track schedule as CSV. Export uses the existing engine rows without another
  calculation, retains entered-terms/forecast classifications, and is disabled
  for stale results. CSV includes a UTF-8 BOM, CRLF separators, quoted text and
  plain numeric cells. Formula-like text is neutralized. The filename identifies
  the displayed schedule. Object URLs and temporary anchors are released.
- Save, edit-save and rename use a shared native modal dialog with an inert
  background, initial name-field focus, explicit Tab/Shift+Tab wrapping, Escape
  dismissal, and focus restoration to the persistent trigger. Escape is blocked
  while saving, and duplicate submissions are guarded. Save and rename support
  Enter. Edit mode requires an explicit update/copy choice; Enter only submits
  after choosing the save-as-new confirmation. Rejected requests keep the dialog
  usable and show the existing localized error messages.

No database schema, data, auth configuration or deployment was changed. The
existing pending performance changes were retained. `jsdom` 30.1.3 was added as
an exact development dependency for component interaction tests.

## Verification

- 666 offline tests passed; one optional official-source network test skipped.
  Seventeen new tests cover draft recovery/isolation/storage denial, CSV engine
  values and escaping, download lifecycle/stale results, modal focus boundaries,
  save failures, concurrency-token retention and explicit edit choices.
- Production build and TypeScript passed. All 27 production route smoke checks
  passed. ESLint has no errors or new warnings; seven existing warnings remain.
- Isolated Chrome production-build checks at 390 × 844 verified recovery of
  amount and partial rate after reload and Hebrew-to-English navigation,
  calculation, disabled stale export, and real CSV downloads for combined and
  individual schedules. Downloaded files each contained 300 data rows; for the
  two identical test tracks, combined amounts equalled twice the selected track
  in every month. No application console errors or page-wide overflow appeared.
- Actual save/edit/rename components were also loaded in an isolated local
  browser harness with synthetic auth and mocked mutation services. Chrome
  verified Tab and Shift+Tab containment, Escape, restored trigger focus, Enter
  saving, blocked Escape while pending, explicit edit choice and mobile layout.
  The browser check caught native Tab traversal reaching browser chrome; an
  explicit boundary handler and a regression test were added before final QA.
- Browser artifacts are in ignored `output/playwright/`. These checks do not
  constitute a live authenticated Supabase mutation test, a production rollout,
  or a mobile performance measurement. No production writes were needed.
