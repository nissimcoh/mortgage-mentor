# Commercial-Bank Calibration Backlog

The Prime track is calibrated against a Leumi golden benchmark. The
following implemented tracks are **methodology-faithful (Directive 451) but
not yet commercially calibrated**. Each needs one golden benchmark captured
from an official bank calculator/approval before we claim bank-level accuracy.

## Pending calibration cases

| # | Product | resetPeriodMonths | Status |
|---|---------|-------------------|--------|
| 1 | Variable government-bond, every 2 years | 24 | pending |
| 2 | Variable government-bond, every 2.5 years | 30 | pending |
| 3 | Variable government-bond, every 3 years | 36 | pending |
| 4 | Variable government-bond, every 5 years | 60 | pending |
| 5 | Variable government-bond, every 7 or 10 years | 84 / 120 | pending |
| 6 | Annual Makam | 12 | pending |
| 7 | Fixed CPI-linked (implemented, uncalibrated) | — | pending |

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
