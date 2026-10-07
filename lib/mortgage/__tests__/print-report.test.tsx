import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Report from "../../../components/MortgagePrintReport";
import he from "../../../app/[locale]/dictionaries/he.json";
import en from "../../../app/[locale]/dictionaries/en.json";
import { calculateScenarioSummary } from "../calculations";
import type { MortgageTrackInput } from "../types";
import type { CalculatorMarketData } from "../../market-data/build-calculator-market-data";

const market: CalculatorMarketData = {
  boiRatePercent: 3, boiRateEffectiveDate: "2026-01-01", boiRateStatus: "live", boiNextDecisionAt: null,
  marketFetchedAt: "2026-10-06T12:00:00Z", curves: [], curveStatus: "live", makamSnapshots: [], makamStatus: "live",
};

it.each(["he", "en"] as const)("prints submitted metrics and rate/CPI assumptions in %s", locale => {
  const labels = (locale === "he" ? he : en).calculator;
  const inputs: MortgageTrackInput[] = [
    { type: "fixedUnlinked", repaymentMethod: "equalPrincipal", loanAmount: 120000, years: 10, annualInterestRatePercent: 3 },
    { type: "variableLinked", repaymentMethod: "spitzer", loanAmount: 60000, years: 10, currentCustomerRatePercent: 2, resetPeriodMonths: 60, forecastMode: "constant", forecastRealZeroYieldsPercent: [], expectedCpiIndexPath: [], forecastCurveId: "synthetic-reference", forecastCurvePublicationDate: "2026-10-05" },
  ];
  const summary = calculateScenarioSummary({ tracks: inputs });
  const html = renderToStaticMarkup(<Report inputs={inputs} summary={summary} marketData={market} locale={locale} labels={labels} generatedAt="2026-10-06T12:00:00Z" />);
  const money = new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-US", { style: "currency", currency: "ILS", maximumFractionDigits: 2 });
  expect(html).toContain(money.format(summary.totalPayment));
  expect(html).toContain(money.format(summary.currentCombinedFirstPayment));
  expect(html).toContain(labels.inflationModeConstant);
  expect(html).toContain(labels.forecastModeConstant);
  expect(html).toContain(labels.trackTypeVariableLinked);
  expect(html).toContain(labels.repaymentMethodEqualPrincipal);
  expect(html).toContain("synthetic-reference");
  expect(html).toContain(locale === "he" ? 'dir="rtl"' : 'dir="ltr"');
});

it("shows separate rate and inflation stress shifts and missing reference dates", () => {
  const inputs: MortgageTrackInput[] = [{
    type: "variableLinked", repaymentMethod: "spitzer", loanAmount: 180000, years: 10, currentCustomerRatePercent: 3,
    resetPeriodMonths: 60, forecastMode: "stress", stressShiftPercent: -1, inflationStressShiftPercent: 2,
    forecastRealZeroYieldsPercent: Array(120).fill(2), expectedCpiIndexPath: Array(121).fill(100),
  }];
  const html = renderToStaticMarkup(<Report inputs={inputs} summary={calculateScenarioSummary({ tracks: inputs })} marketData={market} locale="en" labels={en.calculator} generatedAt="2026-10-06T12:00:00Z" />);
  expect(html).toContain(en.calculator.stressShiftLabel);
  expect(html).toContain(en.calculator.inflationStressShiftLabel);
  expect(html).toContain("-1%");
  expect(html).toContain("2%");
  expect(html).toContain(en.calculator.pdfSourceMissing);
});
