import type { ComparisonScenario } from "./comparison";
import { cumulativePayments } from "./comparison-chart-data";

export type ComparisonHighlight = "lowestTotal" | "lowestFirst" | "lowestPeak" | "mostFixed";

/** Id of the single scenario with the extreme value, or null on a tie. */
function uniqueExtreme(scenarios: ComparisonScenario[], value: (item: ComparisonScenario) => number, pick: "min" | "max") {
  const values = scenarios.map(value);
  const best = pick === "min" ? Math.min(...values) : Math.max(...values);
  const winners = scenarios.filter((_, index) => Math.abs(values[index] - best) < 0.005);
  return winners.length === 1 ? winners[0].id : null;
}

/** Which scenario leads each comparison dimension; ties award no one. */
export function comparisonHighlights(scenarios: ComparisonScenario[]): Record<ComparisonHighlight, string | null> {
  if (scenarios.length < 2) return { lowestTotal: null, lowestFirst: null, lowestPeak: null, mostFixed: null };
  return {
    lowestTotal: uniqueExtreme(scenarios, item => item.result.forecastTotalPaid, "min"),
    lowestFirst: uniqueExtreme(scenarios, item => item.result.firstPayment, "min"),
    lowestPeak: uniqueExtreme(scenarios, item => item.result.highestPayment, "min"),
    mostFixed: uniqueExtreme(scenarios, item => item.fixedShare, "max"),
  };
}

/**
 * First month at which `a`'s cumulative payments cross `b`'s (the side that
 * was cheaper so far becomes the more expensive one). Null when either
 * history is missing or the lead never changes.
 */
export function cumulativeCrossoverMonth(a: readonly number[] | null, b: readonly number[] | null): number | null {
  if (!a || !b) return null;
  const cumulativeA = cumulativePayments(a);
  const cumulativeB = cumulativePayments(b);
  const months = Math.max(a.length, b.length);
  const at = (series: number[], month: number) => series[Math.min(month, series.length - 1)];
  let initialSign = 0;
  for (let month = 1; month <= months; month++) {
    const sign = Math.sign(at(cumulativeA, month) - at(cumulativeB, month));
    if (sign === 0) continue;
    if (initialSign === 0) initialSign = sign;
    else if (sign !== initialSign) return month;
  }
  return null;
}
