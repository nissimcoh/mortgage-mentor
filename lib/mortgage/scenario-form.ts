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
  parseSignedDecimal,
  parseWholeAmount,
} from "../forms/numeric";
import { isPrimeForecastMode, type PrimeForecastMode } from "./forecast";
import type { MortgageTrackInput } from "./types";

// The values the UI currently exposes.
export const SUPPORTED_TRACK_TYPES = ["fixedUnlinked", "prime"] as const;
export type SupportedTrackType = (typeof SUPPORTED_TRACK_TYPES)[number];
export const SUPPORTED_TRACK_TYPE = "fixedUnlinked"; // default track type
export const SUPPORTED_REPAYMENT_METHODS = ["spitzer", "equalPrincipal"] as const;
export type SupportedRepaymentMethod =
  (typeof SUPPORTED_REPAYMENT_METHODS)[number];
export const DEFAULT_REPAYMENT_METHOD: SupportedRepaymentMethod = "spitzer";
export const DEFAULT_FORECAST_MODE: PrimeForecastMode = "official";

function isSupportedTrackType(
  value: string | null,
): value is SupportedTrackType {
  return (SUPPORTED_TRACK_TYPES as readonly string[]).includes(value ?? "");
}

/**
 * The market context prime tracks need at parse time: the current BOI rate
 * and the available official forecast curves (newest first).
 */
export interface MarketContextForParsing {
  boiRatePercent: number;
  curves: ReadonlyArray<{
    id: string;
    publicationDate: string;
    nominalZeroYieldsPercent: readonly number[];
  }>;
}

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
  /** Fixed tracks: the quoted annual rate. */
  ratePercent: string;
  years: string;
  trackType: string;
  repaymentMethod: string;
  /** Prime tracks: the annual rate the bank currently offers. */
  currentRatePercent: string;
  /** Prime tracks: "official" | "constant" | "stress". */
  forecastMode: string;
  /** Prime tracks, mode "stress": parallel shift in percentage points. */
  stressShift: string;
  /** Prime tracks: the official curve the last calculation used. */
  forecastCurveId: string;
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
    currentRatePercent: "",
    forecastMode: DEFAULT_FORECAST_MODE,
    stressShift: "",
    forecastCurveId: "",
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
 * Pick the curve a prime draft should use.
 *
 * A pinned ID resolves ONLY to that exact curve: when it is unavailable
 * this returns null (and the calculation stays invalid) rather than
 * silently substituting the latest curve — the user must explicitly clear
 * the pin to update to the latest curve. The latest curve is used only
 * when no ID is pinned.
 */
export function resolveForecastCurve(
  draft: TrackDraft,
  market: MarketContextForParsing,
) {
  if (draft.forecastCurveId !== "") {
    return (
      market.curves.find((curve) => curve.id === draft.forecastCurveId) ?? null
    );
  }
  return market.curves[0] ?? null;
}

/** True when the draft pins a curve ID that is not available. */
export function isPinnedCurveMissing(
  draft: TrackDraft,
  market: MarketContextForParsing,
): boolean {
  return (
    draft.trackType === "prime" &&
    draft.forecastCurveId !== "" &&
    !market.curves.some((curve) => curve.id === draft.forecastCurveId)
  );
}

/**
 * Convert one draft into an engine input. Returns null when any field is
 * missing/invalid, so callers can never feed the engine a wrong number.
 * Prime drafts additionally need the market context (BOI rate + curves).
 */
export function parseTrackDraft(
  draft: TrackDraft,
  market?: MarketContextForParsing,
): MortgageTrackInput | null {
  if (
    !isSupportedTrackType(draft.trackType) ||
    !isSupportedRepaymentMethod(draft.repaymentMethod)
  ) {
    return null;
  }

  const loanAmount = parseWholeAmount(draft.amount);
  const years = Number(draft.years);
  if (
    loanAmount === null ||
    loanAmount <= 0 ||
    !Number.isInteger(years) ||
    years < MIN_YEARS ||
    years > MAX_YEARS
  ) {
    return null;
  }

  if (draft.trackType === "prime") {
    if (!market) return null;
    const curve = resolveForecastCurve(draft, market);
    if (!curve || curve.nominalZeroYieldsPercent.length < years * 12) {
      return null;
    }
    const currentRatePercent = parseDecimalRate(draft.currentRatePercent);
    if (currentRatePercent === null) return null;

    const forecastMode = isPrimeForecastMode(draft.forecastMode)
      ? draft.forecastMode
      : DEFAULT_FORECAST_MODE;
    let stressShiftPercent = 0;
    if (forecastMode === "stress") {
      const shift = parseSignedDecimal(draft.stressShift);
      if (shift === null) return null;
      stressShiftPercent = shift;
    }

    return {
      type: "prime",
      repaymentMethod: draft.repaymentMethod,
      loanAmount,
      years,
      currentCustomerRatePercent: currentRatePercent,
      currentBankOfIsraelRatePercent: market.boiRatePercent,
      forecastZeroYieldsPercent: curve.nominalZeroYieldsPercent,
      forecastMode,
      stressShiftPercent,
      forecastCurveId: curve.id,
      forecastCurvePublicationDate: curve.publicationDate,
    };
  }

  const ratePercent = parseDecimalRate(draft.ratePercent);
  if (ratePercent === null) return null;

  return {
    type: "fixedUnlinked",
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
  market?: MarketContextForParsing,
): MortgageTrackInput[] | null {
  if (drafts.length === 0) return null;
  const inputs: MortgageTrackInput[] = [];
  for (const draft of drafts) {
    const input = parseTrackDraft(draft, market);
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
    const years = sanitizeYears(draft.years);
    if (years !== "") {
      query.set(`${prefix}Years`, years);
    }
    query.set(`${prefix}Type`, draft.trackType);
    query.set(`${prefix}RepaymentMethod`, draft.repaymentMethod);

    if (draft.trackType === "prime") {
      // Prime-only params; fixed-rate-only params are never written here.
      const currentRate = parseDecimalRate(draft.currentRatePercent);
      if (currentRate !== null) {
        query.set(`${prefix}CurrentRatePercent`, String(currentRate));
      }
      const mode = isPrimeForecastMode(draft.forecastMode)
        ? draft.forecastMode
        : DEFAULT_FORECAST_MODE;
      query.set(`${prefix}ForecastMode`, mode);
      if (mode === "stress") {
        const shift = parseSignedDecimal(draft.stressShift);
        query.set(`${prefix}ForecastStressShift`, String(shift ?? 0));
      }
      if (draft.forecastCurveId !== "") {
        query.set(`${prefix}ForecastCurveId`, draft.forecastCurveId);
      }
    } else {
      // Fixed-only params; prime-only params are never written here.
      const rate = parseDecimalRate(draft.ratePercent);
      if (rate !== null) {
        query.set(`${prefix}AnnualInterestRatePercent`, String(rate));
      }
    }
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
      const trackType = isSupportedTrackType(type)
        ? type
        : SUPPORTED_TRACK_TYPE;
      const mode = query.get(`${prefix}ForecastMode`);
      drafts.push(
        createTrackDraft({
          amount: formatAmountForDisplay(query.get(`${prefix}Amount`) ?? ""),
          ratePercent:
            trackType === "prime"
              ? ""
              : (query.get(`${prefix}AnnualInterestRatePercent`) ?? ""),
          years: sanitizeYears(query.get(`${prefix}Years`) ?? ""),
          trackType,
          repaymentMethod: isSupportedRepaymentMethod(method)
            ? method
            : DEFAULT_REPAYMENT_METHOD,
          currentRatePercent:
            trackType === "prime"
              ? (query.get(`${prefix}CurrentRatePercent`) ?? "")
              : "",
          forecastMode: isPrimeForecastMode(mode)
            ? mode
            : DEFAULT_FORECAST_MODE,
          stressShift: query.get(`${prefix}ForecastStressShift`) ?? "",
          forecastCurveId:
            trackType === "prime"
              ? (query.get(`${prefix}ForecastCurveId`) ?? "")
              : "",
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
