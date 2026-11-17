"use client";

import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import {
  checkMessage,
  combinePayoffFiles,
  fillTemplate,
  formatIsoDate,
  formatMoney,
  missingLoanFields,
  parseNumberInput,
  suggestAnchorSeries,
  prepareForConfirm,
  updateTrackInFile,
  type CombinedLoan,
  type ExistingMortgageMarket,
  type PayoffAnchorSeries,
  type PayoffCheck,
  type PayoffConfirmField,
  type PayoffLoan,
  type PayoffReportFile,
  type PayoffTrack,
  type PayoffVariableRate,
} from "@/lib/payoff-report";
import ExistingMortgageForecast from "./ExistingMortgageForecast";
import Icon from "./Icon";

type Labels = Dictionary["payoffPage"];

const MAX_FILES = 10;
const MAX_BYTES = 4 * 1024 * 1024;
/** Read by the simulation step; one browser tab, cleared with the tab. */
const CONFIRMED_STORAGE_KEY = "mortgage-mentor:payoff-confirmed:v1";

type Upload =
  | { id: string; name: string; status: "reading" }
  | { id: string; name: string; status: "done"; file: PayoffReportFile; hadIssues: boolean }
  | { id: string; name: string; status: "error"; error: string; source: File };

type DoneUpload = Extract<Upload, { status: "done" }>;

type ReadResult =
  | { ok: true; file: PayoffReportFile; issues: unknown[] }
  | { ok: false; error: string };

async function readReport(source: File): Promise<ReadResult> {
  if (source.size > MAX_BYTES) return { ok: false, error: "too-large" };
  if (source.size === 0) return { ok: false, error: "empty" };
  const body = new FormData();
  body.set("file", source);
  try {
    const response = await fetch("/api/payoff-report", { method: "POST", body });
    const json = (await response.json().catch(() => null)) as ReadResult | null;
    if (json && json.ok) return json;
    return { ok: false, error: json && !json.ok ? json.error : "generic" };
  } catch {
    return { ok: false, error: "generic" };
  }
}

function isPdfName(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export default function PayoffReportUpload({
  locale,
  labels,
  market,
}: {
  locale: Locale;
  labels: Labels;
  market: ExistingMortgageMarket;
}) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // The loans as confirmed; any edit or upload clears it.
  const [confirmed, setConfirmedLoans] = useState<PayoffLoan[] | null>(null);
  const clearConfirmation = () => setConfirmedLoans(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);

  const errorText = (code: string) =>
    labels.errors[code as keyof Labels["errors"]] ?? labels.errors.generic;

  function setUpload(id: string, upload: Upload) {
    setUploads((current) => current.map((item) => (item.id === id ? upload : item)));
  }

  async function startReading(id: string, source: File) {
    setUpload(id, { id, name: source.name, status: "reading" });
    if (!isPdfName(source)) {
      setUpload(id, { id, name: source.name, status: "error", error: "not-pdf", source });
      return;
    }
    const result = await readReport(source);
    setUpload(
      id,
      result.ok
        ? {
            id,
            name: source.name,
            status: "done",
            file: prepareForConfirm(result.file),
            hadIssues: result.issues.length > 0,
          }
        : { id, name: source.name, status: "error", error: result.error, source },
    );
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    clearConfirmation();
    const room = MAX_FILES - uploads.length;
    const accepted = Array.from(list).slice(0, Math.max(0, room));
    setNotice(
      list.length > accepted.length ? fillTemplate(labels.tooManyFiles, { max: MAX_FILES }) : null,
    );
    const added = accepted.map((source) => ({
      id: `upload-${nextId.current++}`,
      source,
    }));
    setUploads((current) => [
      ...current,
      ...added.map(({ id, source }): Upload => ({ id, name: source.name, status: "reading" })),
    ]);
    // Parallel on purpose: one slow or unreadable file never holds up the rest.
    for (const { id, source } of added) void startReading(id, source);
  }

  function removeUpload(id: string) {
    clearConfirmation();
    setUploads((current) => current.filter((item) => item.id !== id));
  }

  const done = uploads.filter((item): item is DoneUpload => item.status === "done");
  // Cheap enough to recompute on every edit; keeps one source of truth.
  const combined = combinePayoffFiles(done.map((item) => item.file));
  const missingCount = combined.loans.reduce(
    (count, entry) => count + missingLoanFields(entry.loan).length,
    0,
  );
  const reading = uploads.some((item) => item.status === "reading");

  function editTrack(entry: CombinedLoan, trackIndex: number, update: (track: PayoffTrack) => PayoffTrack) {
    const target = done[entry.fileIndex];
    clearConfirmation();
    setUploads((current) =>
      current.map((item) =>
        item.id === target.id && item.status === "done"
          ? { ...item, file: updateTrackInFile(item.file, entry.loanIndex, trackIndex, update) }
          : item,
      ),
    );
  }

  function confirm() {
    try {
      sessionStorage.setItem(
        CONFIRMED_STORAGE_KEY,
        JSON.stringify({ confirmedAt: new Date().toISOString(), loans: combined.loans.map((entry) => entry.loan) }),
      );
    } catch {
      // Storage can be unavailable (private mode, quotas); the confirmation
      // itself still stands for this page view.
    }
    setConfirmedLoans(combined.loans.map((entry) => entry.loan));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`glass-panel flex flex-col items-center px-6 py-10 text-center transition-colors ${
          dragging ? "ring-2 ring-accent" : ""
        }`}
      >
        <span aria-hidden="true" className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Icon name="table" size={26} />
        </span>
        <p className="text-xl font-semibold tracking-tight">{labels.dropTitle}</p>
        <p className="mt-2 text-base text-slate-500">{labels.dropHint}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploads.length >= MAX_FILES}
          className="glass-button mt-6 inline-flex min-h-11 items-center px-6 text-[15px] font-medium"
        >
          {labels.chooseFiles}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <p className="mt-5 max-w-xl text-sm leading-6 text-slate-500">{labels.privacyNote}</p>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notice}
        </p>
      )}

      {uploads.length > 0 && (
        <section aria-labelledby="payoff-files-heading">
          <h2 id="payoff-files-heading" className="mb-3 text-lg font-semibold">{labels.filesHeading}</h2>
          <ul className="space-y-2" aria-live="polite">
            {uploads.map((item) => (
              <li key={item.id} className="glass-track flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium" dir="auto">{item.name}</span>
                {item.status === "reading" && (
                  <span className="flex items-center gap-2 text-slate-500">
                    <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-accent" />
                    {labels.statusReading}
                  </span>
                )}
                {item.status === "done" && (
                  <span className="text-accent">
                    {labels.statusDone}
                    {item.hadIssues && <span className="ms-2 text-amber-700">{labels.issuesNotice}</span>}
                  </span>
                )}
                {item.status === "error" && (
                  <span className="flex items-center gap-3 text-red-700">
                    {labels.statusError}: {errorText(item.error)}
                    {item.error !== "not-pdf" && item.error !== "too-large" && item.error !== "empty" && (
                      <button type="button" className="underline" onClick={() => void startReading(item.id, item.source)}>
                        {labels.retry}
                      </button>
                    )}
                  </span>
                )}
                {item.status !== "reading" && (
                  <button
                    type="button"
                    onClick={() => removeUpload(item.id)}
                    className="rounded-full p-1 text-slate-400 hover:bg-black/5 hover:text-slate-700"
                    aria-label={fillTemplate(labels.removeFile, { file: item.name })}
                  >
                    <Icon name="close" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {combined.loans.length > 0 && (
        <>
          <Summary labels={labels} locale={locale} combined={combined} />
          {combined.loans.map((entry) => (
            <LoanCard
              key={`${done[entry.fileIndex]?.id}-${entry.loanIndex}`}
              entry={entry}
              labels={labels}
              locale={locale}
              onEdit={(trackIndex, update) => editTrack(entry, trackIndex, update)}
            />
          ))}

          <div className="glass-panel flex flex-wrap items-center gap-4 px-6 py-5">
            {confirmed ? (
              <div className="flex-1">
                <p className="text-lg font-semibold text-accent">{labels.confirmedTitle}</p>
                <p className="mt-1 text-sm text-slate-500">{labels.confirmedBody}</p>
              </div>
            ) : (
              <p className="flex-1 text-sm text-slate-500" role="status">
                {reading
                  ? labels.confirmWaiting
                  : missingCount > 0
                    ? fillTemplate(labels.confirmBlocked, { count: missingCount })
                    : null}
              </p>
            )}
            {confirmed ? (
              <button type="button" onClick={() => clearConfirmation()} className="glass-secondary inline-flex min-h-11 items-center px-5 text-sm font-medium">
                {labels.editAgain}
              </button>
            ) : (
              <button
                type="button"
                onClick={confirm}
                disabled={reading || missingCount > 0}
                className="glass-button inline-flex min-h-11 items-center px-6 text-[15px] font-medium"
              >
                {labels.confirmButton}
              </button>
            )}
          </div>
          {confirmed && (
            <ExistingMortgageForecast loans={confirmed} market={market} labels={labels} locale={locale} />
          )}
        </>
      )}
    </div>
  );
}

function Summary({
  labels,
  locale,
  combined,
}: {
  labels: Labels;
  locale: Locale;
  combined: ReturnType<typeof combinePayoffFiles>;
}) {
  const { totals, asOfDates, skipped } = combined;
  const stats: [string, string][] = [
    [labels.summaryToSettle, formatMoney(totals.totalToSettle, locale)],
    [labels.summaryMonthly, formatMoney(totals.monthlyPayment, locale)],
    [labels.summaryFees, formatMoney(totals.fees, locale)],
    [labels.summaryActiveTracks, String(totals.activeTrackCount)],
  ];
  return (
    <section aria-labelledby="payoff-summary-heading" className="glass-hero px-6 py-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="payoff-summary-heading" className="text-lg font-semibold">{labels.summaryHeading}</h2>
        {asOfDates.length === 1 && (
          <span className="text-sm text-slate-500">{fillTemplate(labels.summaryAsOf, { date: formatIsoDate(asOfDates[0]) })}</span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight" dir="ltr">{value}</dd>
          </div>
        ))}
      </dl>
      {asOfDates.length > 1 && (
        <p className="mt-4 text-sm text-amber-800">
          {fillTemplate(labels.multipleDatesNotice, { dates: asOfDates.map(formatIsoDate).join(", ") })}
        </p>
      )}
      {skipped.map((skip, index) => (
        <p key={index} className="mt-2 text-sm text-slate-500">
          {fillTemplate(skip.reason === "duplicate" ? labels.skippedDuplicate : labels.skippedOlder, {
            file: skip.fileName,
            loan: skip.loanNumber,
          })}
        </p>
      ))}
    </section>
  );
}

function CheckList({ checks, labels, locale }: { checks: PayoffCheck[]; labels: Labels; locale: Locale }) {
  if (checks.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">{labels.checksHeading}</p>
      <ul className="mt-1 list-disc space-y-1 ps-5">
        {checks.map((check, index) => (
          <li key={`${check.code}-${index}`}>{checkMessage(check, labels.checks, locale)}</li>
        ))}
      </ul>
    </div>
  );
}

function LoanCard({
  entry,
  labels,
  locale,
  onEdit,
}: {
  entry: CombinedLoan;
  labels: Labels;
  locale: Locale;
  onEdit: (trackIndex: number, update: (track: PayoffTrack) => PayoffTrack) => void;
}) {
  const { loan, checks } = entry;
  const missing = missingLoanFields(loan);
  const active = loan.tracks.map((track, index) => ({ track, index })).filter(({ track }) => track.status === "active");
  const closed = loan.tracks.map((track, index) => ({ track, index })).filter(({ track }) => track.status === "closed");
  const trackName = (track: PayoffTrack, index: number) =>
    track.label ?? fillTemplate(labels.trackDefault, { n: index + 1 });

  return (
    <section className="glass-panel px-5 py-5 sm:px-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {loan.loanNumber ? (
            <>
              {fillTemplate(labels.loanHeading, { number: "" })}
              <span dir="ltr" className="tabular-nums">{loan.loanNumber}</span>
            </>
          ) : (
            labels.loanWithoutNumber
          )}
        </h2>
        <span className="text-sm text-slate-500" dir="auto">
          {[loan.bankName, fillTemplate(labels.loanFrom, { file: entry.fileName })].filter(Boolean).join(" · ")}
        </span>
      </header>

      <CheckList checks={checks.filter((check) => check.trackIndex === null)} labels={labels} locale={locale} />

      <div className="mt-4 space-y-4">
        {active.map(({ track, index }) => (
          <div key={index} className="glass-track px-4 py-4">
            <p className="mb-3 font-medium">{trackName(track, index)}</p>
            <TrackFields
              track={track}
              labels={labels}
              missing={missing.filter((item) => item.trackIndex === index).map((item) => item.field)}
              onChange={(update) => onEdit(index, update)}
            />
            <div className="mt-3">
              <CheckList checks={checks.filter((check) => check.trackIndex === index)} labels={labels} locale={locale} />
            </div>
          </div>
        ))}
      </div>

      {closed.length > 0 && (
        <details className="mt-4 text-sm text-slate-500">
          <summary className="cursor-pointer">{fillTemplate(labels.closedTracks, { count: closed.length })}</summary>
          <ul className="mt-2 space-y-1 ps-4">
            {closed.map(({ track, index }) => (
              <li key={index}>
                {fillTemplate(labels.closedTrackLine, { label: trackName(track, index), date: formatIsoDate(track.endDate) })}
              </li>
            ))}
          </ul>
          <CheckList checks={checks.filter((check) => closed.some(({ index }) => index === check.trackIndex))} labels={labels} locale={locale} />
        </details>
      )}
    </section>
  );
}

function TrackFields({
  track,
  labels,
  missing,
  onChange,
}: {
  track: PayoffTrack;
  labels: Labels;
  missing: PayoffConfirmField[];
  onChange: (update: (track: PayoffTrack) => PayoffTrack) => void;
}) {
  const isMissing = (field: PayoffConfirmField) => missing.includes(field);
  const setBalance = (key: keyof PayoffTrack["balance"]) => (value: number | null) =>
    onChange((current) => ({ ...current, balance: { ...current.balance, [key]: value } }));
  const variable: PayoffVariableRate = track.variable ?? {
    marginPercent: null,
    anchorText: null,
    resetFrequencyMonths: null,
    nextResetDate: null,
    originalRatePercent: null,
  };
  const setVariable = (patch: Partial<PayoffVariableRate>) =>
    onChange((current) => ({
      ...current,
      variable: { ...(current.variable ?? variable), ...patch },
    }));
  const suggested = suggestAnchorSeries(track);

  return (
    <div className="glass-form grid gap-x-4 gap-y-3 sm:grid-cols-3">
      <SelectField
        label={labels.fields.rateType}
        value={track.rateType}
        options={labels.options.rateType}
        choose={labels.options.choose}
        missing={isMissing("rateType") ? labels.missingField : null}
        onChange={(rateType) => onChange((current) => withAnchorSuggestion({ ...current, rateType: rateType ?? "unknown" }))}
      />
      <SelectField
        label={labels.fields.linkage}
        value={track.linkage}
        options={labels.options.linkage}
        choose={labels.options.choose}
        missing={isMissing("linkage") ? labels.missingField : null}
        onChange={(linkage) => onChange((current) => withAnchorSuggestion({ ...current, linkage: linkage ?? "unknown" }))}
      />
      <SelectField
        label={labels.fields.repaymentMethod}
        value={track.repaymentMethod}
        options={labels.options.repaymentMethod}
        choose={labels.options.choose}
        missing={isMissing("repaymentMethod") ? labels.missingField : null}
        onChange={(method) => onChange((current) => ({ ...current, repaymentMethod: method ?? "unknown" }))}
      />
      <NumberField
        label={labels.fields.annualRatePercent}
        value={track.annualRatePercent}
        missing={isMissing("annualRatePercent") ? labels.missingField : null}
        onChange={(value) => onChange((current) => ({ ...current, annualRatePercent: value }))}
      />
      <NumberField
        label={labels.fields.monthlyPayment}
        value={track.monthlyPayment}
        missing={isMissing("monthlyPayment") ? labels.missingField : null}
        onChange={(value) => onChange((current) => ({ ...current, monthlyPayment: value }))}
      />
      <DateField
        label={labels.fields.endDate}
        value={track.endDate}
        missing={isMissing("endDate") ? labels.missingField : null}
        onChange={(value) => onChange((current) => ({ ...current, endDate: value }))}
      />
      <NumberField
        label={labels.fields.principal}
        value={track.balance.principal}
        missing={isMissing("principal") ? labels.missingField : null}
        onChange={setBalance("principal")}
      />
      {(track.linkage === "cpi" || track.balance.indexation !== null) && (
        <NumberField label={labels.fields.indexation} value={track.balance.indexation} onChange={setBalance("indexation")} />
      )}
      <NumberField label={labels.fields.accruedInterest} value={track.balance.accruedInterest} onChange={setBalance("accruedInterest")} />
      <NumberField
        label={labels.fields.feesTotal}
        value={track.fees.total}
        onChange={(value) => onChange((current) => ({ ...current, fees: { ...current.fees, total: value } }))}
      />
      <NumberField label={labels.fields.totalToSettle} value={track.balance.totalToSettle} onChange={setBalance("totalToSettle")} />

      {track.rateType === "variable" && (
        <>
          <div className="sm:col-span-3 mt-1 border-t border-black/5 pt-3" />
          <div className="sm:col-span-3">
            <SelectField
              label={labels.fields.anchorSeries}
              value={variable.anchorSeries ?? "unknown"}
              options={labels.options.anchorSeries}
              choose={labels.options.choose}
              missing={isMissing("anchorSeries") ? labels.missingField : null}
              onChange={(series) => setVariable({ anchorSeries: (series as PayoffAnchorSeries | null) ?? null })}
              hint={[
                variable.anchorText ? fillTemplate(labels.anchorPrinted, { text: variable.anchorText }) : null,
                suggested !== null && variable.anchorSeries === suggested ? labels.anchorSuggested : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </div>
          <NumberField
            label={labels.fields.marginPercent}
            value={variable.marginPercent}
            missing={isMissing("marginPercent") ? labels.missingField : null}
            onChange={(value) => setVariable({ marginPercent: value })}
          />
          <NumberField
            label={labels.fields.resetFrequencyMonths}
            value={variable.resetFrequencyMonths}
            onChange={(value) =>
              onChange((current) =>
                withAnchorSuggestion({ ...current, variable: { ...(current.variable ?? variable), resetFrequencyMonths: value } }),
              )
            }
          />
          <DateField
            label={labels.fields.nextResetDate}
            value={variable.nextResetDate}
            missing={isMissing("nextResetDate") ? labels.missingField : null}
            onChange={(value) => setVariable({ nextResetDate: value })}
          />
        </>
      )}
    </div>
  );
}

/** Once the facts behind a suggestion are known, offer it; never override a choice. */
function withAnchorSuggestion(track: PayoffTrack): PayoffTrack {
  if (track.rateType !== "variable" || track.variable?.anchorSeries != null) return track;
  const suggestion = suggestAnchorSeries(track);
  return suggestion === null || track.variable === null
    ? track
    : { ...track, variable: { ...track.variable, anchorSeries: suggestion } };
}

function Field({
  label,
  missing,
  hint,
  children,
}: {
  label: string;
  missing?: string | null;
  hint?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = missing ?? (hint || null);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children(id, note ? noteId : undefined)}
      {note && (
        <p id={noteId} className={`mt-1 text-xs ${missing ? "text-red-700" : "text-slate-500"}`}>{note}</p>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  missing,
  onChange,
}: {
  label: string;
  value: number | null;
  missing?: string | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <Field label={label} missing={missing}>
      {(id, describedBy) => (
        <input
          // Remount when the stored value changes so the field shows it.
          key={String(value)}
          id={id}
          type="text"
          inputMode="decimal"
          dir="ltr"
          defaultValue={value === null ? "" : String(value)}
          aria-invalid={missing ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full border px-3 tabular-nums ${missing ? "border-red-400" : ""}`}
          onBlur={(event) => {
            const parsed = parseNumberInput(event.target.value);
            if (parsed === undefined) event.target.value = value === null ? "" : String(value);
            else if (parsed !== value) onChange(parsed);
          }}
        />
      )}
    </Field>
  );
}

function DateField({
  label,
  value,
  missing,
  onChange,
}: {
  label: string;
  value: string | null;
  missing?: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <Field label={label} missing={missing}>
      {(id, describedBy) => (
        <input
          id={id}
          type="date"
          dir="ltr"
          value={value ?? ""}
          aria-invalid={missing ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full border px-3 ${missing ? "border-red-400" : ""}`}
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        />
      )}
    </Field>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  choose,
  missing,
  hint,
  onChange,
}: {
  label: string;
  value: T | "unknown";
  options: Record<T, string>;
  choose: string;
  missing?: string | null;
  hint?: string;
  onChange: (value: T | null) => void;
}) {
  return (
    <Field label={label} missing={missing} hint={hint}>
      {(id, describedBy) => (
        <select
          id={id}
          value={value}
          aria-invalid={missing ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full border px-3 ${missing ? "border-red-400" : ""}`}
          onChange={(event) => onChange(event.target.value === "unknown" ? null : (event.target.value as T))}
        >
          <option value="unknown">{choose}</option>
          {(Object.entries(options) as [T, string][]).map(([key, text]) => (
            <option key={key} value={key}>{text}</option>
          ))}
        </select>
      )}
    </Field>
  );
}
