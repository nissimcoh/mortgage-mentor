"use client";

import Link from "next/link";
// Type-only import: erased at compile time, keeps the server-only
// dictionary module out of the client bundle.
import type { Dictionary } from "@/app/[locale]/dictionaries";

type ComparePageLabels = Dictionary["comparePage"];

const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

interface ScenarioLinkInputProps {
  labels: ComparePageLabels;
  scenarioLabel: string;
  name: string;
  onNameChange: (value: string) => void;
  rawLink: string;
  onRawLinkChange: (value: string) => void;
  onLoad: () => void;
  loaded: boolean;
  loadedTrackCount: number;
  error: string | null;
  calculatorHref: string;
}

/** One scenario's paste-a-link input card. Purely presentational — all
 * parsing/state lives in ScenarioCompare. */
export default function ScenarioLinkInput({
  labels,
  scenarioLabel,
  name,
  onNameChange,
  rawLink,
  onRawLinkChange,
  onLoad,
  loaded,
  loadedTrackCount,
  error,
  calculatorHref,
}: ScenarioLinkInputProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-bold text-slate-900">
        {scenarioLabel}
      </h2>

      <label className="mb-3 block">
        <span className={labelClass}>{labels.scenarioNameLabel}</span>
        <input
          type="text"
          autoComplete="off"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={labels.scenarioNamePlaceholder}
          className={fieldClass}
        />
      </label>

      <label className="mb-3 block">
        <span className={labelClass}>{labels.pasteLinkLabel}</span>
        <input
          type="text"
          autoComplete="off"
          value={rawLink}
          onChange={(event) => onRawLinkChange(event.target.value)}
          placeholder={labels.pasteLinkPlaceholder}
          className={fieldClass}
          dir="ltr"
        />
      </label>

      {error && (
        <p role="alert" className="mb-2 text-xs text-red-600">
          {error}
        </p>
      )}
      {loaded && !error && (
        <p className="mb-2 text-xs text-emerald-700">
          {labels.scenarioLoadedSummary.replace(
            "{n}",
            String(loadedTrackCount),
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onLoad}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-700"
        >
          {labels.loadScenarioButton}
        </button>
        <Link
          href={calculatorHref}
          className="text-sm text-slate-500 underline transition hover:text-slate-800"
        >
          {labels.orBuildManuallyLabel}
        </Link>
      </div>
    </div>
  );
}
