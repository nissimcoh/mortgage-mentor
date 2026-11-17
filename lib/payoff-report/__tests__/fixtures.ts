/**
 * Fictional report data in the shape a reader returns. All numbers are
 * invented but internally consistent: parts sum to totals, payments follow
 * from balance, rate and remaining term, and no-notice fees are 0.1%.
 * Never put a real customer's report in this public repository.
 */

const emptyFees = {
  capitalization: null,
  capitalizationRatePercent: null,
  capitalizationReductionPercent: null,
  capitalizationReductionAmount: null,
  notice: null,
  averageCpi: null,
  operational: null,
  total: null,
};

/** Two loans in one file, as some banks send them; report date 2026-03-10. */
export function fictionalTwoLoanFile() {
  return {
    loans: [
      {
        bankName: "בנק לדוגמה",
        loanNumber: "11-1111111-01-11",
        asOfDate: "2026-03-10",
        loanLevelFees: 60,
        reportedTotals: { monthlyPayment: 2149.37, fees: 1612.65, totalToSettle: 234260.18 },
        tracks: [
          {
            label: "משנה 1",
            status: "active",
            loanTypeText: "פרטית",
            originalAmount: 200000,
            startDate: "2021-03-01",
            firstPaymentDate: "2021-04-01",
            endDate: "2036-03-01",
            monthlyPayment: 1576.36,
            annualRatePercent: 4.8,
            repaymentMethod: "spitzer",
            linkage: "unlinked",
            cpiBaseIndex: null,
            rateType: "fixed",
            variable: null,
            fees: {
              ...emptyFees,
              capitalization: 1200,
              capitalizationRatePercent: 4.1,
              notice: 150.18,
              total: 1350.18,
            },
            balance: {
              principal: 150000,
              indexation: null,
              accruedInterest: 177.53,
              futureMonthlyCharge: null,
              arrears: null,
              otherCharges: null,
              totalToSettle: 151527.71,
            },
          },
          {
            label: "משנה 2",
            status: "active",
            loanTypeText: "פרטית",
            originalAmount: 90000,
            startDate: "2021-03-01",
            firstPaymentDate: "2021-04-01",
            endDate: "2041-03-01",
            monthlyPayment: 573.01,
            annualRatePercent: 3.1,
            repaymentMethod: "spitzer",
            linkage: "cpi",
            cpiBaseIndex: 100.5,
            rateType: "variable",
            variable: {
              marginPercent: 1.2,
              anchorText: "עוגן",
              resetFrequencyMonths: 60,
              nextResetDate: "2028-09-01",
              originalRatePercent: 2.9,
            },
            fees: { ...emptyFees, notice: 82.47, averageCpi: 120, total: 202.47 },
            balance: {
              principal: 80000,
              indexation: 2400,
              accruedInterest: 70,
              futureMonthlyCharge: null,
              arrears: null,
              otherCharges: null,
              totalToSettle: 82672.47,
            },
          },
          {
            label: "משנה 3",
            status: "closed",
            loanTypeText: "פרטית",
            originalAmount: 50000,
            startDate: "2021-03-01",
            firstPaymentDate: "2021-04-01",
            endDate: "2025-06-01",
            monthlyPayment: 0,
            annualRatePercent: 4.2,
            repaymentMethod: "spitzer",
            linkage: "unlinked",
            cpiBaseIndex: null,
            rateType: "fixed",
            variable: null,
            fees: emptyFees,
            balance: {
              principal: null,
              indexation: null,
              accruedInterest: null,
              futureMonthlyCharge: null,
              arrears: null,
              otherCharges: null,
              totalToSettle: null,
            },
          },
        ],
      },
      {
        bankName: "בנק לדוגמה",
        loanNumber: "11-2222222-01-22",
        asOfDate: "2026-03-10",
        loanLevelFees: null,
        reportedTotals: { monthlyPayment: 718.5, fees: 50.07, totalToSettle: 50118.07 },
        tracks: [
          {
            label: "משנה 1",
            status: "active",
            loanTypeText: "פרטית",
            originalAmount: 55000,
            startDate: "2025-03-01",
            firstPaymentDate: "2025-04-01",
            endDate: "2033-03-01",
            monthlyPayment: 718.5,
            annualRatePercent: 5.5,
            repaymentMethod: "spitzer",
            linkage: "unlinked",
            cpiBaseIndex: null,
            rateType: "prime",
            variable: null,
            fees: { ...emptyFees, notice: 50.07, total: 50.07 },
            balance: {
              principal: 50000,
              indexation: null,
              accruedInterest: 68,
              futureMonthlyCharge: null,
              arrears: null,
              otherCharges: null,
              totalToSettle: 50118.07,
            },
          },
        ],
      },
    ],
  };
}

/** Deep copy for tests that mutate one field. */
export function cloneRaw<T>(value: T): T {
  return structuredClone(value);
}
