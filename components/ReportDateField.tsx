import { useId } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { fillTemplate, needsReportDate, type PayoffLoan } from "@/lib/payoff-report";

export default function ReportDateField({ loan, index, labels, onChange }: {
  loan: PayoffLoan;
  index: number;
  labels: Dictionary["payoffPage"];
  onChange: (date: string | null) => void;
}) {
  const id = useId();
  const missing = needsReportDate(loan);
  return (
    <div className="glass-form">
      <label htmlFor={id} className="block text-sm font-medium">
        {fillTemplate(labels.reportDateLabel, { loan: loan.loanNumber ?? index + 1 })}
      </label>
      <input id={id} type="date" dir="ltr" value={loan.asOfDate ?? ""}
        className={`mt-1 border px-3 ${missing ? "border-red-400" : ""}`}
        aria-invalid={missing} aria-describedby={missing ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value || null)} />
      {missing && <p id={`${id}-hint`} className="mt-1 text-sm text-red-700">{labels.reportDateHint}</p>}
    </div>
  );
}
