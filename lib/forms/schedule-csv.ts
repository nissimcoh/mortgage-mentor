import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { AmortizationEntry } from "../mortgage/types";
import type { ScheduleBasis } from "../mortgage/schedule-certainty";

/** Quote text for CSV and neutralize spreadsheet formulas, including leading whitespace. */
function textCell(value: string) {
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
const numberCell = (value: number | undefined) => value === undefined || !Number.isFinite(value) ? "" : String(value);

/** Export existing engine rows, with raw numeric cells and UTF-8 BOM for Excel Hebrew. */
export function buildScheduleCsv(schedule: AmortizationEntry[], rowBases: ScheduleBasis[], labels: Dictionary["calculator"], rateHeader = labels.rateHeader): string {
  const basisLabels: Record<ScheduleBasis, string> = {
    contractual: labels.scheduleBasisContractual, rate: labels.scheduleBasisRate,
    index: labels.scheduleBasisIndex, rateAndIndex: labels.scheduleBasisRateAndIndex,
  };
  const headers = [labels.monthHeader, labels.scheduleBasisHeader, rateHeader, labels.paymentHeader, labels.principalLabel, labels.interestLabel, labels.remainingBalanceHeader];
  const rows = schedule.map((entry, index) => [
    numberCell(entry.month), textCell(basisLabels[rowBases[index]] ?? labels.csvEstimated),
    numberCell(entry.activeAnnualRatePercent), numberCell(entry.payment),
    numberCell(entry.principalPayment), numberCell(entry.interestPayment), numberCell(entry.remainingBalance),
  ].join(","));
  return `\uFEFF${[headers.map(textCell).join(","), ...rows].join("\r\n")}\r\n`;
}
