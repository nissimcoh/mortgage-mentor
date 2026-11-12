/**
 * The home page's live loan model: one fixed-rate, unlinked Spitzer track.
 *
 * It is built from the same engine primitives the calculator uses for a
 * fixed-unlinked track (nominal annual rate, agorot-rounded payment), so the
 * figures on the home page match what the calculator shows for the same
 * inputs. A test pins that equality.
 */

import { buildSpitzerSchedule, roundMoney } from "@/lib/mortgage/amortization";
import { annualPercentToMonthlyRate, MONTHS_PER_YEAR } from "@/lib/mortgage/interest";

export interface LoanYearPoint {
  /** 0 = the day the loan starts, N = after N full years. */
  year: number;
  /** Balance still owed at that point. */
  balance: number;
  /** Interest paid from the start up to that point. */
  interestPaid: number;
  /** Principal repaid from the start up to that point. */
  principalPaid: number;
  /**
   * Share of a monthly payment that is interest at that point (0..1): the
   * payment right after it, or the final payment at the end of the loan.
   */
  interestShare: number;
}

export interface LoanStory {
  loanAmount: number;
  annualRatePercent: number;
  years: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
  /** One point per year boundary, years + 1 entries. */
  points: LoanYearPoint[];
  /**
   * First month in which more of the payment repays principal than pays
   * interest. 1 when that is true from the start.
   */
  crossoverMonth: number;
}

export const LOAN_STORY_LIMITS = {
  amount: { min: 200_000, max: 3_000_000, step: 50_000 },
  years: { min: 5, max: 30, step: 1 },
  rate: { min: 2, max: 8, step: 0.1 },
} as const;

export function buildLoanStory(loanAmount: number, annualRatePercent: number, years: number): LoanStory {
  const schedule = buildSpitzerSchedule({
    loanAmount,
    monthlyRate: annualPercentToMonthlyRate(annualRatePercent, "nominalAnnual"),
    numberOfPayments: Math.round(years * MONTHS_PER_YEAR),
  });

  const points: LoanYearPoint[] = [];
  let interestPaid = 0;
  let principalPaid = 0;
  let totalPaid = 0;
  let crossoverMonth = schedule.length;
  const share = (index: number) => {
    const entry = schedule[Math.min(index, schedule.length - 1)];
    return entry.payment > 0 ? entry.interestPayment / entry.payment : 0;
  };

  points.push({ year: 0, balance: loanAmount, interestPaid: 0, principalPaid: 0, interestShare: share(0) });
  schedule.forEach((entry, index) => {
    interestPaid += entry.interestPayment;
    principalPaid += entry.principalPayment;
    totalPaid += entry.payment;
    if (entry.principalPayment > entry.interestPayment && entry.month < crossoverMonth) crossoverMonth = entry.month;
    if (entry.month % MONTHS_PER_YEAR === 0) {
      points.push({
        year: entry.month / MONTHS_PER_YEAR,
        balance: entry.remainingBalance,
        interestPaid: roundMoney(interestPaid),
        principalPaid: roundMoney(principalPaid),
        interestShare: share(index + 1),
      });
    }
  });

  totalPaid = roundMoney(totalPaid);
  return {
    loanAmount,
    annualRatePercent,
    years,
    monthlyPayment: schedule[0].payment,
    totalPaid,
    totalInterest: roundMoney(totalPaid - loanAmount),
    points,
    crossoverMonth,
  };
}

/** Linear interpolation between year points, for a continuous scrubber or scroll position. */
export function loanPointAt(story: LoanStory, year: number): LoanYearPoint {
  const clamped = Math.min(Math.max(year, 0), story.years);
  const lower = Math.floor(clamped);
  const upper = Math.min(lower + 1, story.years);
  const t = clamped - lower;
  const a = story.points[lower];
  const b = story.points[upper];
  const mix = (from: number, to: number) => from + (to - from) * t;
  return {
    year: clamped,
    balance: mix(a.balance, b.balance),
    interestPaid: mix(a.interestPaid, b.interestPaid),
    principalPaid: mix(a.principalPaid, b.principalPaid),
    interestShare: mix(a.interestShare, b.interestShare),
  };
}

/** Calculator URL that reproduces the home simulator's inputs as a one-track mix. */
export function loanStoryCalculatorHref(locale: string, story: Pick<LoanStory, "loanAmount" | "annualRatePercent" | "years">): string {
  const query = new URLSearchParams({
    trackCount: "1",
    track1Amount: String(story.loanAmount),
    track1Years: String(story.years),
    track1Type: "fixedUnlinked",
    track1RepaymentMethod: "spitzer",
    track1AnnualInterestRatePercent: String(story.annualRatePercent),
  });
  return `/${locale}/calculator?${query}`;
}
