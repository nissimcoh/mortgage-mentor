# Commercial-Bank Calibration Backlog

Updated October 18, 2026. Full monthly references are now captured from Leumi's
public calculator for all supported forecast products. See
[CALCULATOR_REVIEW.md](CALCULATOR_REVIEW.md) for exact differences and scope.
This is calibration of representative synthetic cases against one bank, not
exhaustive validation of all offers, payment dates, fees or other banks.

## Captured calibration cases

All cases use ILS 500,000, Spitzer and a 4.5% offered annual rate. The app-side
BOI snapshot is `2026-09-calendar`, published October 5, 2026. Leumi does not
identify its curve snapshot. References include monthly payments and their
principal/interest components, not just whole-ILS screen outputs.

| Product | Reset months | Term | Result |
| --- | ---: | ---: | --- |
| Government-bond unlinked | 24 | 20y | Monthly payments and total match exactly |
| Government-bond unlinked | 30 | 20y | Monthly payments and total match exactly |
| Government-bond unlinked | 36 | 21y | Monthly payments and total match exactly |
| Government-bond unlinked | 60 | 25y | Monthly payments and total match exactly |
| Government-bond unlinked | 84 | 21y | Monthly payments and total match exactly |
| Government-bond unlinked | 120 | 20y | Monthly payments and total match exactly |
| Annual Makam | 12 | 20y | Baseline corrected; maximum monthly difference ILS 0.01, total +0.12 |
| Fixed CPI-linked | — | 20y | Precision corrected; maximum monthly difference ILS 0.01, total +0.01 |
| Variable CPI-linked | 60 | 20y | Precision corrected; maximum monthly difference ILS 0.01, total +0.04 |
| Prime | Monthly | 20y | Maximum monthly difference ILS 0.01; total −0.10; interest/principal split differs by up to ILS 0.02 |
| Fixed unlinked control | — | 20y | Regular payments match; final payoff differs by ILS 1.21 due to cash rounding convention; not accepted as an exact bank schedule |

Tests: `lib/mortgage/__tests__/leumi-monthly-calibration.test.ts`.
Frozen inputs, official source snapshot, bank requests and full responses:
`lib/mortgage/__tests__/fixtures/leumi-calibration-2026-10-18.json`.
Every month is compared, including the months immediately before and after
all rate resets. Maximum forecast payment and displayed IRR match; total
forecast payment differences for the ten forecast references are below ILS 1.

## Remaining coverage

- Other banks, loan amounts, offered rates, terms and fractional catalog terms.
- Mixed-product bank references and contract-specific payment/day-count rules.
- Fixed cash-schedule payoff convention versus a bank's mathematical forecast.
- Fees, insurance, interim interest and actual CPI publication/payment dates.
- Additional zero/negative-rate and stress bank references (synthetic engine
  tests already cover these; they are not independent bank calibration).

The following template remains useful when adding further captures.

## Input template (identical for every case)

- amount: **500000**
- repayment: **Spitzer**
- offered rate: **4.5%** (for fixed CPI-linked: the offered LINKED annual rate)
- `returnPaymentDetails=true`
- term: use a mid-catalog option for the product (e.g. 20y for 24m, 20y for 30m, 25y for 60m, 21y for 84m, 20y for 120m, 20y for Makam, **20y for fixed CPI-linked**)

## Values to capture per case

- `totalFirstPayment`
- `totalHighestPayment`
- `totalAmountPaid`
- `totalIrr`
- `monthlyPayments` (full array, for schedule-shape comparison)

Also record: capture date, the bank, the BOI forecast-curve publication in
effect at capture time (e.g. `2026-06-calendar`), for Makam the anchor
month, and for fixed CPI-linked the source freshness visible in the app's
"מקורות נתונים ועדכניות" section at capture time — forecasts are only
reproducible against the same curve/anchor snapshot (the app's URL pinning
exists for exactly this).

## Acceptance per case

- first payment: exact (2 d.p.)
- highest payment: exact (2 d.p.)
- total paid: ≤ 1 ILS tolerance (public workbook exposes 4 decimals)
- IRR: ≤ 0.01 pp
- month-by-month payments: no drift beyond rounding

Turn each captured case into a frozen-fixture golden test next to
`lib/mortgage/__tests__/forecast.test.ts` (the Prime golden is the model).
Discrepancies beyond tolerance mean an anchor-baseline or margin-derivation
assumption needs revisiting (documented in `lib/mortgage/forecast.ts`).


## Variable CPI-linked implementation scope

The first exposed product resets every 60 months, with terms 10/15/20/25/30
whole years. This is the app's current supported subset, not a claim that banks
only offer these terms. The forecast uses the real zero curve and separate
expected CPI index. The initial margin uses offered rate minus the real 60-month
spot yield. The representative October 18 case is now captured and tested month by month. Monthly linkage applies
between resets; the remaining indexed debt is repriced at each reset.

Primary methodology reference: Bank of Israel Directive 451, pp. 23–24:
https://www.boi.org.il/media/i5jbijyv/451_21.pdf

Product reference (five-year linked government-bond, Spitzer):
https://www.leumi.co.il/he/Standard-Contracts

## First public-screen comparison: variable CPI-linked

Captured in the public Leumi expanded calculator during the September 12–13,
2026 session: https://ufapi.bankleumi.co.il/mortgageCalculator/ExtCalc
Synthetic input: ILS 500,000; 20 years; Spitzer; variable CPI-linked government
bond resetting every five years; offered annual rate 3%.

| Metric | Leumi visible result | App result |
| --- | ---: | ---: |
| First payment at current rate | 2,772 (whole ILS display) | 2,772.99 |
| Maximum forecast payment | 4,277 (whole ILS display) | 4,277.60 |
| Total forecast payments | 834,368 (whole ILS display) | 834,369.22 |
| Forecast overall rate | 5.29% | 5.29% |

The app used the August 2026 calendar curve. The bank screen did not expose a
curve identifier or a full monthly schedule. This is a preliminary comparison,
not a calibrated golden fixture: its total differs by ILS 1.22 from the bank's
integer display, and the bank's exact decimals are unknown. This historical preliminary comparison has been superseded by the full
October 18 API capture above; the 3% case itself still needs a monthly reference.
