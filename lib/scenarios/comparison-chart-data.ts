/**
 * Mix identity: one color per comparison slot, validated all-pairs on the
 * light surface (chroma, CVD, normal-vision floor, 3:1 contrast). The dash
 * pattern is the secondary channel, so identity never relies on hue alone.
 */
export const COMPARISON_LINE_STYLES = [
  { color: "#00897b", dash: undefined },
  { color: "#6250d6", dash: "8 4" },
  { color: "#b8862e", dash: "2 4" },
] as const;

/** Integer agorot avoid accumulated floating-point drift. Includes month zero. */
export function cumulativePayments(payments: readonly number[]): number[] {
  let agorot = 0;
  return [0, ...payments.map(payment => { agorot += Math.round(payment * 100); return agorot / 100; })];
}

/** A completed mix has no further payments; its cumulative total stays flat. */
export function comparisonMonthValues(payments: readonly number[], cumulative: readonly number[], month: number) {
  return { payment: payments[month - 1] ?? 0, cumulative: cumulative[Math.min(month, payments.length)] ?? 0 };
}
