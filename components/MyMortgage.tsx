"use client";

import { useState } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { deleteMyMortgage, saveMyMortgage } from "@/lib/payoff-report/actions";
import {
  fillTemplate,
  needsReportDate,
  type ExistingMortgageMarket,
  type PayoffLoan,
  type SavedMyMortgage,
} from "@/lib/payoff-report";
import { formatDateOnly } from "@/lib/forms/dates";
import type { ComparisonScenario } from "@/lib/scenarios/comparison";
import ExistingMortgageForecast from "./ExistingMortgageForecast";
import PayoffReportUpload from "./PayoffReportUpload";
import ReportDateField from "./ReportDateField";
import type { ShareContext } from "./share-image/types";

type Labels = Dictionary["payoffPage"];

/**
 * The My mortgage page body. With a saved mortgage it opens on its forecast,
 * with options to replace it from new reports or delete it; without one it
 * opens on the upload-and-confirm flow, which ends in saving.
 */
export default function MyMortgage({
  locale,
  labels,
  calculatorLabels,
  market,
  initialSaved,
  mixes,
  comparisonLabels,
  readingAvailable,
  share,
}: {
  locale: Locale;
  labels: Labels;
  calculatorLabels: Dictionary["calculator"];
  market: ExistingMortgageMarket;
  initialSaved: SavedMyMortgage | null;
  /** The user's saved mixes, without payment series (loaded on selection). */
  mixes: ComparisonScenario[];
  comparisonLabels: Dictionary["savedComparison"];
  /** Whether the server can read reports (its API key is configured). */
  readingAvailable: boolean;
  /** Offers the summary and comparison images. */
  share?: ShareContext;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [replacing, setReplacing] = useState(initialSaved === null);
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirm" | "deleting" | "error">("idle");

  async function save(loans: PayoffLoan[], expectedUpdatedAt?: string): Promise<string | null> {
    const result = await saveMyMortgage(loans, expectedUpdatedAt).catch(() => ({ ok: false as const, error: "failed" }));
    if (!result.ok) return result.error;
    setSaved({ loans, updatedAt: result.updatedAt });
    setReplacing(false);
    return null;
  }

  async function remove() {
    if (deleteStep !== "confirm") {
      setDeleteStep("confirm");
      return;
    }
    setDeleteStep("deleting");
    const result = await deleteMyMortgage();
    if (!result.ok) {
      setDeleteStep("error");
      return;
    }
    setSaved(null);
    setReplacing(true);
    setDeleteStep("idle");
  }

  if (saved !== null && !replacing) {
    return (
      <div className="space-y-6">
        <div className="glass-panel flex flex-wrap items-center gap-4 px-6 py-5">
          <div className="flex-1">
            <p className="text-lg font-semibold">{labels.savedTitle}</p>
            <p className="mt-1 text-sm text-slate-500">
              {fillTemplate(labels.savedUpdated, { date: formatDateOnly(saved.updatedAt, locale) })}
            </p>
          </div>
          {readingAvailable && (
            <button
              type="button"
              onClick={() => setReplacing(true)}
              className="glass-secondary inline-flex min-h-11 items-center px-5 text-sm font-medium"
            >
              {labels.replaceFromReports}
            </button>
          )}
          <button
            type="button"
            onClick={() => void remove()}
            disabled={deleteStep === "deleting"}
            className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            {deleteStep === "confirm" ? labels.deleteConfirm : labels.deleteSaved}
          </button>
          {deleteStep === "error" && (
            <p role="alert" className="w-full text-sm text-red-700">{labels.saveError}</p>
          )}
        </div>
        {saved.loans.some(needsReportDate) ? (
          <SavedDateRepair key={saved.updatedAt} loans={saved.loans} labels={labels}
            onSave={(loans) => save(loans, saved.updatedAt)} />
        ) : <ExistingMortgageForecast
          loans={saved.loans}
          market={market}
          labels={labels}
          calculatorLabels={calculatorLabels}
          locale={locale}
          comparison={{ mixes, labels: comparisonLabels }}
          share={share}
        />}
      </div>
    );
  }

  if (!readingAvailable) {
    return (
      <div className="glass-panel px-6 py-14 text-center">
        <p className="text-xl font-semibold tracking-tight">{labels.unavailableTitle}</p>
        <p className="mt-2 text-base text-slate-500">{labels.unavailableBody}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {saved !== null && (
        <button
          type="button"
          onClick={() => setReplacing(false)}
          className="text-sm text-slate-500 underline hover:text-slate-900"
        >
          {labels.cancelReplace}
        </button>
      )}
      <PayoffReportUpload
        locale={locale}
        labels={labels}
        market={market}
        calculatorLabels={calculatorLabels}
        onSave={save}
        hasSaved={saved !== null}
        share={share}
      />
    </div>
  );
}

function SavedDateRepair({ loans, labels, onSave }: {
  loans: PayoffLoan[];
  labels: Labels;
  onSave: (loans: PayoffLoan[]) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(loans);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="glass-panel space-y-4 px-6 py-5" onSubmit={async (event) => {
      event.preventDefault();
      if (saving || draft.some(needsReportDate)) return;
      setSaving(true);
      setError(await onSave(draft));
      setSaving(false);
    }}>
      <h2 className="text-lg font-semibold">{labels.repairDateTitle}</h2>
      <p className="text-sm text-slate-600">{labels.repairDateBody}</p>
      <fieldset disabled={saving} className="space-y-3">
        {loans.map((loan, index) => needsReportDate(loan) && (
          <ReportDateField key={index} loan={draft[index]} index={index} labels={labels}
            onChange={(asOfDate) => setDraft((current) => current.map((entry, i) => i === index ? { ...entry, asOfDate } : entry))} />
        ))}
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error === "changed" ? labels.repairDateChanged : labels.saveError}</p>}
      <button type="submit" disabled={saving || draft.some(needsReportDate)} className="glass-button min-h-11 px-5 text-sm font-medium">
        {saving ? labels.saving : labels.repairDateSave}
      </button>
    </form>
  );
}
