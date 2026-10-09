import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { formatDateOnly, formatDateTimeIsrael } from "@/lib/forms/dates";
import type { MortgageTrackInput, ScenarioSummary } from "@/lib/mortgage/types";
import type { CalculatorMarketData } from "@/lib/market-data/build-calculator-market-data";
import { getForecastFinancingCost } from "@/lib/mortgage/result-presentation";
import BrandMark from "./BrandMark";

export interface MortgagePrintReportProps {
  inputs: MortgageTrackInput[];
  summary: ScenarioSummary;
  marketData: CalculatorMarketData;
  locale: Locale;
  labels: Dictionary["calculator"];
  generatedAt: string;
}

/** Prints the submitted result verbatim; never calculates from half-edited form inputs. */
export default function MortgagePrintReport({ inputs, summary, marketData, locale, labels, generatedAt }: MortgagePrintReportProps) {
  const language = locale === "he" ? "he-IL" : "en-US";
  const money = new Intl.NumberFormat(language, { style: "currency", currency: "ILS", maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 3 });
  const names = {
    fixedUnlinked: labels.trackTypeFixedUnlinked, prime: labels.trackTypePrime,
    variableGovernmentBond: labels.trackTypeGovernmentBond, variableMakam: labels.trackTypeMakam,
    fixedLinked: labels.trackTypeFixedLinked, variableLinked: labels.trackTypeVariableLinked,
  };
  const metrics = [
    [labels.mortgageAmountLabel, money.format(inputs.reduce((sum, input) => sum + input.loanAmount, 0))],
    [labels.firstPaymentLabel, money.format(summary.currentCombinedFirstPayment)],
    [labels.forecastMaxPaymentLabel, money.format(summary.maximumPayment)],
    [labels.forecastTotalPaymentLabel, money.format(summary.totalPayment)],
    [labels.financingCostLabel, money.format(getForecastFinancingCost(summary))],
    [labels.forecastOverallRateLabel, percent.format(summary.forecastOverallRatePercent / 100)],
  ];
  return (
    <article className="mortgage-print-root" dir={locale === "he" ? "rtl" : "ltr"} lang={locale}>
      <header><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><BrandMark /><strong>MortgageMentor</strong></span><h1>{labels.pdfTitle}</h1>
        <p>{labels.pdfCreated}: {formatDateTimeIsrael(generatedAt, locale)}</p>
      </header>
      <dl className="mortgage-print-metrics">{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p>{labels.timelineMonth} {summary.monthOfMaximumPayment}: {labels.forecastMaxPaymentLabel}</p>
      <h2>{labels.perTrackResultsTitle}</h2>
      {inputs.map((input, index) => {
        const variable = input.type !== "fixedUnlinked";
        const curve = variable ? marketData.curves.find(curve => curve.id === input.forecastCurveId) : undefined;
        return <section key={index} className="mortgage-print-track">
          <h3>{labels.trackLabel} {index + 1} — {names[input.type]}</h3>
          <dl>
            <div><dt>{labels.trackAmountLabel}</dt><dd>{money.format(input.loanAmount)}</dd></div>
            <div><dt>{labels.yearsLabel}</dt><dd>{input.years}</dd></div>
            <div><dt>{labels.interestRateLabel}</dt><dd>{percent.format((input.type === "fixedUnlinked" ? input.annualInterestRatePercent : input.currentCustomerRatePercent) / 100)}</dd></div>
            <div><dt>{labels.repaymentMethodLabel}</dt><dd>{input.repaymentMethod === "equalPrincipal" ? labels.repaymentMethodEqualPrincipal : labels.repaymentMethodSpitzer}</dd></div>
            {"resetPeriodMonths" in input && <div><dt>{labels.resetPeriodLabel}</dt><dd>{input.resetPeriodMonths} {labels.monthHeader}</dd></div>}
            {variable && input.type !== "fixedLinked" && <div><dt>{labels.forecastModeLabel}</dt><dd>{input.forecastMode === "official" ? labels.forecastModeOfficial : input.forecastMode === "stress" ? labels.forecastModeStress : labels.forecastModeConstant}</dd></div>}
            {(input.type === "fixedLinked" || input.type === "variableLinked") && <div><dt>{labels.inflationModeLabel}</dt><dd>{input.forecastMode === "official" ? labels.inflationModeOfficial : input.forecastMode === "stress" ? labels.inflationModeStress : labels.inflationModeConstant}</dd></div>}
            {variable && input.type !== "fixedLinked" && input.forecastMode === "stress" && <div><dt>{labels.stressShiftLabel}</dt><dd>{input.stressShiftPercent ?? 0}%</dd></div>}
            {(input.type === "fixedLinked" || input.type === "variableLinked") && input.forecastMode === "stress" && <div><dt>{labels.inflationStressShiftLabel}</dt><dd>{input.inflationStressShiftPercent ?? 0}%</dd></div>}
            {input.type === "prime" && <div><dt>{labels.pdfSource}</dt><dd>BOI: {input.currentBankOfIsraelRatePercent}%{marketData.boiRateStatus === "fallback" || marketData.boiRateIsStale ? ` · ${labels.pdfFallback}` : ""}</dd></div>}
            {input.type === "variableMakam" && <div><dt>{labels.trackTypeMakam}</dt><dd>{input.currentMakamAnchorPercent}% · <bdi>{input.makamSnapshotId ?? "—"}</bdi>{marketData.makamSnapshots.find(snapshot => snapshot.id === input.makamSnapshotId)?.status === "fallback" ? ` · ${labels.pdfFallback}` : ""}</dd></div>}
          </dl>
          {variable && <p>{labels.pdfSource}: <bdi>{input.forecastCurveId ?? "—"}</bdi> · {formatDateOnly(input.forecastCurvePublicationDate, locale)}
            {!input.forecastCurvePublicationDate && ` · ${labels.pdfSourceMissing}`}
            {curve?.status === "fallback" && ` · ${labels.pdfFallback}`}
          </p>}
        </section>;
      })}
      <footer>{labels.pdfNote}</footer>
    </article>
  );
}
