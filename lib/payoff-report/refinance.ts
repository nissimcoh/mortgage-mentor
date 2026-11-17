import { roundMoney } from "@/lib/mortgage";
import type { ExistingMortgageSimulation } from "./simulate";

/**
 * Weighs the current mortgage, continued as simulated, against a saved mix
 * taken out today to repay it. Refinancing costs the early-repayment fees
 * printed in the reports on top of the new mix's own payments. Figures only;
 * the page words them as a forecast, never as advice.
 */

export interface RefinanceMix {
  firstPayment: number;
  highestPayment: number;
  forecastTotalPaid: number;
  totalPrincipal: number;
  years: number;
}

export interface RefinanceComparison {
  current: { firstPayment: number; highestPayment: number; totalPayment: number; months: number };
  mix: { firstPayment: number; highestPayment: number; totalPayment: number; months: number };
  fees: number;
  mixTotalWithFees: number;
  /** Current total minus the mix's total with fees: positive means refinancing costs less. */
  difference: number;
  balanceToSettle: number;
  /** The mix's loan amount minus the balance to settle. */
  principalGap: number;
  /** Whether the mix borrows about what refinancing would need (within 2%). */
  principalMatches: boolean;
  /**
   * First month by which the current mortgage has cost at least as much as
   * the mix plus fees; null if never, or without the mix's payment series.
   */
  breakEvenMonth: number | null;
}

const PRINCIPAL_TOLERANCE = 0.02;

export function compareRefinance(
  simulation: ExistingMortgageSimulation,
  balanceToSettle: number,
  fees: number,
  mix: RefinanceMix,
  mixPayments?: readonly number[] | null,
): RefinanceComparison {
  const currentPayments = simulation.combinedSchedule.map((entry) => entry.payment);
  const mixTotalWithFees = roundMoney(mix.forecastTotalPaid + fees);
  const principalGap = roundMoney(mix.totalPrincipal - balanceToSettle);

  let breakEvenMonth: number | null = null;
  if (mixPayments && mixPayments.length > 0) {
    let current = 0;
    let refinanced = fees;
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
    fees: roundMoney(fees),
    mixTotalWithFees,
    difference: roundMoney(simulation.totals.totalPayment - mixTotalWithFees),
    balanceToSettle: roundMoney(balanceToSettle),
    principalGap,
    principalMatches: Math.abs(principalGap) <= PRINCIPAL_TOLERANCE * balanceToSettle,
    breakEvenMonth,
  };
}
