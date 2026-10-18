"use client";

import { useState } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { AmortizationEntry } from "@/lib/mortgage/types";
import type { ScheduleBasis } from "@/lib/mortgage/schedule-certainty";
import { buildScheduleCsv } from "@/lib/forms/schedule-csv";

export default function ExportScheduleCsvButton({ schedule, rowBases, labels, title, rateHeader, disabled }: {
  schedule: AmortizationEntry[]; rowBases: ScheduleBasis[]; labels: Dictionary["calculator"];
  title: string; rateHeader?: string; disabled?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  function download() {
    setFailed(false);
    let url: string | undefined;
    const link = document.createElement("a");
    try {
      url = URL.createObjectURL(new Blob([buildScheduleCsv(schedule, rowBases, labels, rateHeader)], { type: "text/csv;charset=utf-8" }));
      link.href = url;
      link.download = `MortgageMentor-${title.replace(/[\\/:*?"<>|]/g, "-")}.csv`;
      document.body.append(link);
      link.click();
    } catch { setFailed(true); }
    finally {
      link.remove();
      // Allow the browser to start consuming the download before releasing it.
      if (url) { const downloadUrl = url; setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000); }
    }
  }
  return <div className="mt-4">
    <button type="button" onClick={download} disabled={disabled || schedule.length === 0}
      className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50">{labels.csvButton}</button>
    <p className="mt-1 text-xs leading-5 text-slate-500">{labels.csvHelp}</p>
    {failed && <p role="alert" className="mt-1 text-sm text-red-700">{labels.csvError}</p>}
  </div>;
}
