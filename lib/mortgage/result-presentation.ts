/**
 * Display-only derivations from an already-computed ScenarioSummary — no
 * financial math happens here, only classification/formatting of numbers
 * the engine already produced. Pure TypeScript, no React.
 */

import type { AmortizationEntry, ScenarioSummary } from "./types";

/**
 * Absolute-shekel tolerance for treating a payment path as "effectively
 * flat." Money values are rounded to agorot (roundMoney, 2 decimals) at
 * each schedule entry; ₪1 comfortably absorbs ordinary rounding noise
 * without masking a real change in payment.
 */
export const PAYMENT_FLAT_TOLERANCE_ILS = 1;

export type PaymentPathClassification = "flat" | "rising" | "nonRising";

/**
 * Classifies the shape of the combined payment schedule — reads the
 * already-computed schedule's `.payment` values directly, never
 * re-derives them:
 *
 * - "flat": the schedule barely varies at all (max − min within
 *   tolerance) — e.g. a single fixed-rate Spitzer track.
 * - "rising": the schedule's maximum exceeds its own first payment by
 *   more than the tolerance — e.g. a prime/variable track whose forecast
 *   rate increases.
 * - "nonRising": everything else — the schedule varies but never rises
 *   above its own starting payment. This covers equal-principal
 *   (payment is highest in month 1 and declines from there) and
 *   multi-track mixes where a shorter track ends and the combined
 *   payment steps down over time. Naively comparing only the maximum
 *   payment to the first payment (without checking the minimum too)
 *   would mis-classify these as "flat".
 *
 * The schedule's own final entry is excluded from the max/min
 * comparison: an amortizing schedule's last payment is routinely
 * adjusted to pay off the exact remaining balance exactly, absorbing
 * accumulated rounding drift from every prior month — a normal artifact
 * of amortization math (confirmed empirically: a plain single-track
 * fixed-rate Spitzer scenario's last payment differs from its regular
 * payment by a few shekels), not a meaningful change in payment from the
 * user's perspective. Without excluding it, a genuinely constant-payment
 * schedule would routinely misclassify as "changing."
 */
export function classifyPaymentPath(
  schedule: ReadonlyArray<Pick<AmortizationEntry, "payment">>,
  tolerance: number = PAYMENT_FLAT_TOLERANCE_ILS,
): PaymentPathClassification {
  if (schedule.length === 0) return "flat";

  const firstPayment = schedule[0].payment;
  const comparable = schedule.length > 1 ? schedule.slice(0, -1) : schedule;
  const payments = comparable.map((entry) => entry.payment);
  const maxPayment = Math.max(...payments);
  const minPayment = Math.min(...payments);

  if (maxPayment - minPayment <= tolerance) return "flat";
  if (maxPayment > firstPayment + tolerance) return "rising";
  return "nonRising";
}

/**
 * Display-only "forecast financing cost": forecast total paid minus the
 * original mortgage principal. For every implemented track type,
 * including fixedLinked (CPI-linked), the engine already computes
 * totalInterest as exactly `totalPayment − loanAmount` (see
 * calculateFixedCpiLinkedTrackSummary's "total forecast interest = total
 * forecast payments − loan (i.e., interest + linkage differentials
 * combined)" — the same formula, summed, at the scenario level). This is
 * a thin, named passthrough — not a new calculation — so the UI never
 * has its own competing definition of "financing cost"; the regression
 * test proves the equivalence rather than assuming it.
 */
export function getForecastFinancingCost(
  summary: Pick<ScenarioSummary, "totalInterest">,
): number {
  return summary.totalInterest;
}
