/**
 * Form-layer helpers for the multi-track calculator: track drafts, URL
 * (de)serialization, and conversion to engine inputs.
 *
 * Pure TypeScript, no React. This module sits between the UI and the
 * engine: it owns strings-and-query concerns, while all financial math
 * stays in the engine (calculations.ts / amortization.ts).
 */

import {
  formatThousands,
  parseDecimalRate,
  parseWholeAmount,
} from "../forms/numeric";
import type { MortgageTrackInput } from "./types";

// The values the UI currently exposes.
export const SUPPORTED_TRACK_TYPE = "fixedUnlinked";
export const SUPPORTED_REPAYMENT_METHODS = ["spitzer", "equalPrincipal"] as const;
export type SupportedRepaymentMethod =
  (typeof SUPPORTED_REPAYMENT_METHODS)[number];
export const DEFAULT_REPAYMENT_METHOD: SupportedRepaymentMethod = "spitzer";

function isSupportedRepaymentMethod(
  value: string | null,
): value is SupportedRepaymentMethod {
  return (SUPPORTED_REPAYMENT_METHODS as readonly string[]).includes(
    value ?? "",
  );
}

export const MIN_TRACKS = 1;
export const MAX_TRACKS = 5;
export const MIN_YEARS = 1;
export const MAX_YEARS = 30;

/** One track as the user edits it. `id` is UI-only (React keys) and is never passed to the engine. */
export interface TrackDraft {
  id: string;
  amount: string;
  ratePercent: string;
  years: string;
  trackType: string;
  repaymentMethod: string;
}

// Deterministic module-level counter: stable keys without pulling in a
// UUID source, and consistent between server and client module instances.
let nextTrackDraftId = 0;

export function createTrackDraft(
  seed?: Partial<Omit<TrackDraft, "id">>,
): TrackDraft {
  nextTrackDraftId += 1;
  return {
    id: `track-${nextTrackDraftId}`,
    amount: "",
    ratePercent: "",
    years: "",
    trackType: SUPPORTED_TRACK_TYPE,
    repaymentMethod: DEFAULT_REPAYMENT_METHOD,
    ...seed,
  };
}

/** Copy a track's values under a fresh stable ID. */
export function duplicateTrackDraft(draft: TrackDraft): TrackDraft {
  const { id: _id, ...values } = draft;
  return createTrackDraft(values);
}

/** Format a raw amount string for display when it parses; keep it as-is otherwise. */
export function formatAmountForDisplay(raw: string): string {
  const parsed = parseWholeAmount(raw);
  return parsed === null ? raw : formatThousands(parsed);
}

function sanitizeYears(raw: string): string {
  const years = Number(raw);
  return Number.isInteger(years) && years >= MIN_YEARS && years <= MAX_YEARS
    ? String(years)
    : "";
}

/**
 * Convert one draft into an engine input. Returns null when any field is
 * missing/invalid, so callers can never feed the engine a wrong number.
 */
export function parseTrackDraft(draft: TrackDraft): MortgageTrackInput | null {
  if (
    draft.trackType !== SUPPORTED_TRACK_TYPE ||
    !isSupportedRepaymentMethod(draft.repaymentMethod)
  ) {
    return null;
  }

  const loanAmount = parseWholeAmount(draft.amount);
  const ratePercent = parseDecimalRate(draft.ratePercent);
  const years = Number(draft.years);
  if (
    loanAmount === null ||
    loanAmount <= 0 ||
    ratePercent === null ||
    !Number.isInteger(years) ||
    years < MIN_YEARS ||
    years > MAX_YEARS
  ) {
    return null;
  }

  return {
    type: SUPPORTED_TRACK_TYPE,
    repaymentMethod: draft.repaymentMethod,
    loanAmount,
    annualInterestRatePercent: ratePercent,
    // The calculator always treats entered rates as the bank-quoted nominal
    // annual rate; the engine's "effectiveAnnual" mode stays advanced-only.
    interestRateInputMode: "nominalAnnual",
    years,
  };
}

/** All drafts as engine inputs, or null if any draft is invalid. */
export function parseAllTrackDrafts(
  drafts: TrackDraft[],
): MortgageTrackInput[] | null {
  if (drafts.length === 0) return null;
  const inputs: MortgageTrackInput[] = [];
  for (const draft of drafts) {
    const input = parseTrackDraft(draft);
    if (input === null) return null;
    inputs.push(input);
  }
  return inputs;
}

/** Live sum of the amounts that currently parse (drafts may be incomplete). */
export function sumEnteredTrackAmounts(drafts: TrackDraft[]): number {
  return drafts.reduce((sum, draft) => {
    const amount = parseWholeAmount(draft.amount);
    return amount !== null && amount > 0 ? sum + amount : sum;
  }, 0);
}

export const LEGACY_TRACK_PARAM_KEYS = [
  "loanAmount",
  "annualInterestRatePercent",
  "years",
  "trackType",
  "repaymentMethod",
];

const TRACK_PARAM_PATTERN = /^track\d+[A-Z]/;

/**
 * Write the drafts into `query` using the readable indexed format
 * (trackCount, track1Amount, track1Years, ...). All previously written
 * indexed params and legacy single-track params are removed first, so
 * removed tracks leave no stale keys and numbering always restarts at 1.
 * Unparseable amount/rate values and empty durations are simply omitted.
 */
export function applyTracksToQuery(
  query: URLSearchParams,
  drafts: TrackDraft[],
): URLSearchParams {
  for (const key of [...query.keys()]) {
    if (
      key === "trackCount" ||
      TRACK_PARAM_PATTERN.test(key) ||
      LEGACY_TRACK_PARAM_KEYS.includes(key)
    ) {
      query.delete(key);
    }
  }

  query.set("trackCount", String(drafts.length));
  drafts.forEach((draft, index) => {
    const prefix = `track${index + 1}`;
    const amount = parseWholeAmount(draft.amount);
    if (amount !== null && amount > 0) {
      query.set(`${prefix}Amount`, String(amount));
    }
    const rate = parseDecimalRate(draft.ratePercent);
    if (rate !== null) {
      query.set(`${prefix}AnnualInterestRatePercent`, String(rate));
    }
    const years = sanitizeYears(draft.years);
    if (years !== "") {
      query.set(`${prefix}Years`, years);
    }
    query.set(`${prefix}Type`, draft.trackType);
    query.set(`${prefix}RepaymentMethod`, draft.repaymentMethod);
  });

  return query;
}

/**
 * Read drafts from the URL. Prefers the indexed format; falls back to the
 * legacy single-track params (loanAmount, years, ...) so old shared links
 * still open as a one-track mix. Returns null when the URL carries no
 * track state at all. Unsupported track types/methods and out-of-range
 * values fall back to safe defaults instead of failing.
 */
export function parseTracksFromQuery(
  query: URLSearchParams,
): TrackDraft[] | null {
  let highestIndex = 0;
  for (const key of query.keys()) {
    const match = /^track(\d+)[A-Z]/.exec(key);
    if (match) highestIndex = Math.max(highestIndex, Number(match[1]));
  }
  // Trust the params that are actually present over the declared count;
  // fall back to trackCount only when no indexed keys exist at all.
  const declaredCount = Number(query.get("trackCount"));
  const base =
    highestIndex > 0
      ? highestIndex
      : Number.isInteger(declaredCount) && declaredCount > 0
        ? declaredCount
        : 0;
  const count = Math.min(base, MAX_TRACKS);

  if (count > 0) {
    const drafts: TrackDraft[] = [];
    for (let index = 1; index <= count; index++) {
      const prefix = `track${index}`;
      const type = query.get(`${prefix}Type`);
      const method = query.get(`${prefix}RepaymentMethod`);
      drafts.push(
        createTrackDraft({
          amount: formatAmountForDisplay(query.get(`${prefix}Amount`) ?? ""),
          ratePercent:
            query.get(`${prefix}AnnualInterestRatePercent`) ?? "",
          years: sanitizeYears(query.get(`${prefix}Years`) ?? ""),
          trackType:
            type === SUPPORTED_TRACK_TYPE ? type : SUPPORTED_TRACK_TYPE,
          repaymentMethod: isSupportedRepaymentMethod(method)
            ? method
            : DEFAULT_REPAYMENT_METHOD,
        }),
      );
    }
    return drafts;
  }

  // Legacy single-track format.
  const loanAmount = query.get("loanAmount");
  const ratePercent = query.get("annualInterestRatePercent");
  const years = query.get("years");
  if (loanAmount === null && ratePercent === null && years === null) {
    return null;
  }
  const legacyType = query.get("trackType");
  const legacyMethod = query.get("repaymentMethod");
  return [
    createTrackDraft({
      amount: formatAmountForDisplay(loanAmount ?? ""),
      ratePercent: ratePercent ?? "",
      years: sanitizeYears(years ?? ""),
      trackType:
        legacyType === SUPPORTED_TRACK_TYPE ? legacyType : SUPPORTED_TRACK_TYPE,
      repaymentMethod: isSupportedRepaymentMethod(legacyMethod)
        ? legacyMethod
        : DEFAULT_REPAYMENT_METHOD,
    }),
  ];
}
