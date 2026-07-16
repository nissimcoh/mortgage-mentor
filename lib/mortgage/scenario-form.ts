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
import {
  isGovernmentBondResetMonths,
  isGovernmentBondTermValid,
  isMakamTermValid,
} from "./product-catalog";
import type { MortgageTrackInput } from "./types";

// The values the UI currently exposes.
export const SUPPORTED_TRACK_TYPES = [
  "fixedUnlinked",
  "prime",
  "variableGovernmentBond",
  "variableMakam",
] as const;
export type SupportedTrackType = (typeof SUPPORTED_TRACK_TYPES)[number];
export const SUPPORTED_TRACK_TYPE = "fixedUnlinked"; // default track type
export const SUPPORTED_REPAYMENT_METHODS = ["spitzer", "equalPrincipal"] as const;
export type SupportedRepaymentMethod =
  (typeof SUPPORTED_REPAYMENT_METHODS)[number];
export const DEFAULT_REPAYMENT_METHOD: SupportedRepaymentMethod = "spitzer";
export const DEFAULT_FORECAST_MODE: PrimeForecastMode = "official";

/** Track types whose future rate comes from the official forecast data. */
export function isVariableStyleTrackType(value: string): boolean {
  return (
    value === "prime" ||
    value === "variableGovernmentBond" ||
    value === "variableMakam"
  );
}

function isSupportedTrackType(
  value: string | null,
): value is SupportedTrackType {
  return (SUPPORTED_TRACK_TYPES as readonly string[]).includes(value ?? "");
}

/**
 * The market context variable-style tracks need at parse time: the current
 * BOI rate, the available official forecast curves (newest first), and the
 * available official Makam anchor snapshots (newest first).
 */
export interface MarketContextForParsing {
  boiRatePercent: number;
  curves: ReadonlyArray<{
    id: string;
    publicationDate: string;
    nominalZeroYieldsPercent: readonly number[];
  }>;
  makamSnapshots?: ReadonlyArray<{
    id: string;
    anchorPercent: number;
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
  /** Prime/variable tracks: the annual rate the bank currently offers. */
  currentRatePercent: string;
  /** Gov-bond tracks: reset period in months ("" until chosen). */
  resetPeriodMonths: string;
  /** Prime/variable tracks: "official" | "constant" | "stress". */
  forecastMode: string;
  /** Prime/variable tracks, mode "stress": shift in percentage points. */
  stressShift: string;
  /** Prime/variable tracks: the official curve the last calculation used. */
  forecastCurveId: string;
  /** Makam tracks: the anchor snapshot the last calculation used. */
  makamSnapshotId: string;
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
    resetPeriodMonths: "",
    forecastMode: DEFAULT_FORECAST_MODE,
    stressShift: "",
    forecastCurveId: "",
    makamSnapshotId: "",
    ...seed,
  };
}

/** A gov-bond reset value, or "" when missing/invalid (user must choose). */
export function sanitizeGovernmentBondReset(raw: string | null): string {
  const months = Number(raw);
  return isGovernmentBondResetMonths(months) ? String(months) : "";
}

/**
 * A gov-bond term is valid only as an exact catalog option for the chosen
 * reset frequency; anything else (including a missing frequency) yields ""
 * so the user must make an explicit valid choice — never a substitution.
 */
export function sanitizeGovernmentBondYears(
  resetRaw: string,
  yearsRaw: string | null,
): string {
  const reset = Number(resetRaw);
  if (!isGovernmentBondResetMonths(reset)) return "";
  const years = Number(yearsRaw);
  return isGovernmentBondTermValid(reset, years) ? String(years) : "";
}

/** A Makam term (whole years from the catalog), or "". */
export function sanitizeMakamYears(raw: string | null): string {
  const years = Number(raw);
  return isMakamTermValid(years) ? String(years) : "";
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
    isVariableStyleTrackType(draft.trackType) &&
    draft.forecastCurveId !== "" &&
    !market.curves.some((curve) => curve.id === draft.forecastCurveId)
  );
}

/**
 * Pick the Makam anchor snapshot a Makam draft should use. Same strict
 * pinning semantics as forecast curves: an unknown pinned snapshot ID
 * yields null, never a silent substitution.
 */
export function resolveMakamSnapshot(
  draft: TrackDraft,
  market: MarketContextForParsing,
) {
  const snapshots = market.makamSnapshots ?? [];
  if (draft.makamSnapshotId !== "") {
    return (
      snapshots.find((snapshot) => snapshot.id === draft.makamSnapshotId) ??
      null
    );
  }
  return snapshots[0] ?? null;
}

/** True when the draft pins a Makam snapshot ID that is not available. */
export function isPinnedMakamSnapshotMissing(
  draft: TrackDraft,
  market: MarketContextForParsing,
): boolean {
  return (
    draft.trackType === "variableMakam" &&
    draft.makamSnapshotId !== "" &&
    !(market.makamSnapshots ?? []).some(
      (snapshot) => snapshot.id === draft.makamSnapshotId,
    )
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
  if (loanAmount === null || loanAmount <= 0) return null;

  const years = Number(draft.years);
  // Years validation is product-specific: catalog options for the two
  // variable products, whole 1..30 years for fixed/prime.
  if (draft.trackType === "variableGovernmentBond") {
    const reset = Number(draft.resetPeriodMonths);
    if (
      !isGovernmentBondResetMonths(reset) ||
      !isGovernmentBondTermValid(reset, years)
    ) {
      return null;
    }
  } else if (draft.trackType === "variableMakam") {
    if (!isMakamTermValid(years)) return null;
  } else if (
    !Number.isInteger(years) ||
    years < MIN_YEARS ||
    years > MAX_YEARS
  ) {
    return null;
  }

  if (isVariableStyleTrackType(draft.trackType)) {
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

    const shared = {
      loanAmount,
      years,
      currentCustomerRatePercent: currentRatePercent,
      forecastZeroYieldsPercent: curve.nominalZeroYieldsPercent,
      forecastMode,
      stressShiftPercent,
      forecastCurveId: curve.id,
      forecastCurvePublicationDate: curve.publicationDate,
    } as const;

    if (draft.trackType === "variableGovernmentBond") {
      const reset = Number(draft.resetPeriodMonths);
      if (!isGovernmentBondResetMonths(reset)) return null;
      return {
        type: "variableGovernmentBond",
        repaymentMethod: "spitzer", // preset-verified product method
        resetPeriodMonths: reset,
        ...shared,
      };
    }

    if (draft.trackType === "variableMakam") {
      const snapshot = resolveMakamSnapshot(draft, market);
      if (!snapshot) return null;
      return {
        type: "variableMakam",
        repaymentMethod: "spitzer", // preset-verified product method
        resetPeriodMonths: 12,
        currentMakamAnchorPercent: snapshot.anchorPercent,
        makamSnapshotId: snapshot.id,
        ...shared,
      };
    }

    return {
      type: "prime",
      repaymentMethod: draft.repaymentMethod,
      currentBankOfIsraelRatePercent: market.boiRatePercent,
      ...shared,
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

    // Years serialization is product-specific: catalog decimals allowed
    // only for the government-bond product.
    const years =
      draft.trackType === "variableGovernmentBond"
        ? sanitizeGovernmentBondYears(draft.resetPeriodMonths, draft.years)
        : draft.trackType === "variableMakam"
          ? sanitizeMakamYears(draft.years)
          : sanitizeYears(draft.years);
    if (years !== "") {
      query.set(`${prefix}Years`, years);
    }
    query.set(`${prefix}Type`, draft.trackType);
    // Preset products are Spitzer-only; never serialize another method.
    query.set(
      `${prefix}RepaymentMethod`,
      draft.trackType === "variableGovernmentBond" ||
        draft.trackType === "variableMakam"
        ? "spitzer"
        : draft.repaymentMethod,
    );

    if (isVariableStyleTrackType(draft.trackType)) {
      // Variable-style params; fixed-rate-only params are never written here.
      const currentRate = parseDecimalRate(draft.currentRatePercent);
      if (currentRate !== null) {
        query.set(`${prefix}CurrentRatePercent`, String(currentRate));
      }
      if (draft.trackType === "variableGovernmentBond") {
        // Reset period is gov-bond-only; never written for prime/Makam.
        const reset = sanitizeGovernmentBondReset(draft.resetPeriodMonths);
        if (reset !== "") {
          query.set(`${prefix}ResetPeriodMonths`, reset);
        }
      }
      if (draft.trackType === "variableMakam" && draft.makamSnapshotId !== "") {
        query.set(`${prefix}MakamSnapshotId`, draft.makamSnapshotId);
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
      // Fixed-only params; variable-style params are never written here.
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
      const rawType = query.get(`${prefix}Type`);
      const method = query.get(`${prefix}RepaymentMethod`);
      // MIGRATION: the retired generic "variableUnlinked" type loads as a
      // government-bond track. Its 24/60-month resets exist in the new
      // catalog and are kept; a 12-month (or other) reset has no gov-bond
      // product and is NOT silently reinterpreted (not even as Makam) —
      // the frequency loads unset and the user must explicitly re-choose.
      const isLegacyVariable = rawType === "variableUnlinked";
      const trackType = isLegacyVariable
        ? "variableGovernmentBond"
        : isSupportedTrackType(rawType)
          ? rawType
          : SUPPORTED_TRACK_TYPE;
      const isVariableStyle = isVariableStyleTrackType(trackType);
      const mode = query.get(`${prefix}ForecastMode`);

      const resetPeriodMonths =
        trackType === "variableGovernmentBond"
          ? sanitizeGovernmentBondReset(
              query.get(`${prefix}ResetPeriodMonths`),
            )
          : "";
      const yearsRaw = query.get(`${prefix}Years`);
      const years =
        trackType === "variableGovernmentBond"
          ? sanitizeGovernmentBondYears(resetPeriodMonths, yearsRaw)
          : trackType === "variableMakam"
            ? sanitizeMakamYears(yearsRaw)
            : sanitizeYears(yearsRaw ?? "");

      drafts.push(
        createTrackDraft({
          amount: formatAmountForDisplay(query.get(`${prefix}Amount`) ?? ""),
          ratePercent: isVariableStyle
            ? ""
            : (query.get(`${prefix}AnnualInterestRatePercent`) ?? ""),
          years,
          trackType,
          repaymentMethod:
            trackType === "variableGovernmentBond" ||
            trackType === "variableMakam"
              ? "spitzer"
              : isSupportedRepaymentMethod(method)
                ? method
                : DEFAULT_REPAYMENT_METHOD,
          currentRatePercent: isVariableStyle
            ? (query.get(`${prefix}CurrentRatePercent`) ?? "")
            : "",
          resetPeriodMonths,
          forecastMode: isPrimeForecastMode(mode)
            ? mode
            : DEFAULT_FORECAST_MODE,
          stressShift: query.get(`${prefix}ForecastStressShift`) ?? "",
          forecastCurveId: isVariableStyle
            ? (query.get(`${prefix}ForecastCurveId`) ?? "")
            : "",
          makamSnapshotId:
            trackType === "variableMakam"
              ? (query.get(`${prefix}MakamSnapshotId`) ?? "")
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
