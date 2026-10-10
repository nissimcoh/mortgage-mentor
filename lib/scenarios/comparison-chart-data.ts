export const COMPARISON_LINE_STYLES = [
  { color: "#0f6e68", dash: undefined },
  { color: "#6d28d9", dash: "8 4" },
  { color: "#b45309", dash: "2 4" },
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
