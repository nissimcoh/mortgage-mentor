import { roundMoney } from "@/lib/mortgage";
import type { ExistingMortgageSimulation } from "./simulate";

/**
 * Weighs the current mortgage, continued as simulated, against a saved mix
 * taken out to settle it. The settlement quote already includes the report's
 * fees. Only cash paid outside the new loan increases its total payments.
 */

export interface RefinanceMix {
  firstPayment: number;
  highestPayment: number;
  forecastTotalPaid: number;
  totalPrincipal: number;
  years: number;
  trackCount?: number;
}

export interface RefinanceComparison {
  current: { firstPayment: number; highestPayment: number; totalPayment: number; months: number };
  mix: { firstPayment: number; highestPayment: number; totalPayment: number; months: number };
  financedFees: number;
  cashFees: number;
  upfrontCosts: number;
  mixTotalWithFees: number;
  /** Current total minus the mix's total with fees: positive means refinancing costs less. */
  difference: number;
  balanceToSettle: number;
  /** Difference left after accounting for cash-paid settlement fees. */
  principalGap: number;
  /** Allows for the calculator rounding each track to whole shekels. */
  principalMatches: boolean;
  /**
   * First month by which the current mortgage has cost at least as much as
   * the mix plus fees; null if never, or without the mix's payment series.
   */
  breakEvenMonth: number | null;
}

export function compareRefinance(
  simulation: ExistingMortgageSimulation,
  balanceToSettle: number,
  fees: number,
  mix: RefinanceMix,
  mixPayments?: readonly number[] | null,
  additionalCashCosts = 0,
): RefinanceComparison {
  const currentPayments = simulation.combinedSchedule.map((entry) => entry.payment);
  const roundingTolerance = (mix.trackCount ?? 1) * 0.5;
  const shortfall = roundMoney(balanceToSettle - mix.totalPrincipal);
  // A mix for the full settlement finances every fee. A smaller mix can
  // leave some or all of the report fees to be paid at closing.
  let cashFees = Math.min(fees, Math.max(0, shortfall));
  if (Math.abs(shortfall) <= roundingTolerance) cashFees = 0;
  else if (Math.abs(shortfall - fees) <= roundingTolerance) cashFees = fees;
  const upfrontCosts = roundMoney(cashFees + additionalCashCosts);
  const mixTotalWithFees = roundMoney(mix.forecastTotalPaid + upfrontCosts);
  const principalGap = roundMoney(cashFees - shortfall);
  const principalMatches = Math.abs(principalGap) <= roundingTolerance;

  let breakEvenMonth: number | null = null;
  if (principalMatches && upfrontCosts > 0 && mixPayments && mixPayments.length > 0) {
    let current = 0;
    let refinanced = upfrontCosts;
    const months = Math.max(currentPayments.length, mixPayments.length);
    for (let month = 0; month < months; month++) {
      current += currentPayments[month] ?? 0;
      refinanced += mixPayments[month] ?? 0;
      if (current >= refinanced) {
        breakEvenMonth = month + 1;
        break;
      }
    }
  }

  return {
    current: {
      firstPayment: simulation.totals.firstMonthPayment,
      highestPayment: simulation.totals.maximumPayment,
      totalPayment: simulation.totals.totalPayment,
      months: currentPayments.length,
    },
    mix: {
      firstPayment: mix.firstPayment,
      highestPayment: mix.highestPayment,
      totalPayment: mix.forecastTotalPaid,
      months: Math.round(mix.years * 12),
    },
    financedFees: roundMoney(fees - cashFees),
    cashFees,
    upfrontCosts,
    mixTotalWithFees,
    difference: roundMoney(simulation.totals.totalPayment - mixTotalWithFees),
    balanceToSettle: roundMoney(balanceToSettle),
    principalGap,
    principalMatches,
    breakEvenMonth,
  };
}
