/**
 * Pure validation/coercion for saved-scenario data crossing an untrusted
 * boundary: the browser-submitted save payload, and a stored row's
 * input_payload column read back at open time. Never trusts raw JSON —
 * every field is explicitly picked and type-checked, never spread.
 */

import { defaultLocale, isValidLocale, type Locale } from "../i18n/config";
import {
  createTrackDraft,
  MAX_TRACKS,
  MIN_TRACKS,
  type TrackDraft,
} from "../mortgage/scenario-form";
import {
  SCENARIO_SCHEMA_VERSION,
  type StoredScenarioInputPayload,
  type StoredScenarioMarketReferences,
  type StoredScenarioResultSnapshot,
} from "./contract";

export const MIN_SCENARIO_NAME_LENGTH = 1;
export const MAX_SCENARIO_NAME_LENGTH = 120;

/**
 * Trims and validates a user-supplied scenario name. Returns the trimmed
 * name, or null when it's missing, not a string, or outside the allowed
 * length after trimming.
 */
export function validateScenarioName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (
    trimmed.length < MIN_SCENARIO_NAME_LENGTH ||
    trimmed.length > MAX_SCENARIO_NAME_LENGTH
  ) {
    return null;
  }
  return trimmed;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Picks only the known TrackDraft string fields off an untrusted object,
 * defaulting anything missing or wrong-typed to "" — never spreads the
 * raw object directly. Always returns a well-formed TrackDraft; whether
 * the *values* are semantically valid (a real track type, a parseable
 * amount, etc.) is checked separately by validateTrackDraft /
 * parseAllTrackDrafts, which this deliberately doesn't duplicate.
 */
export function coerceTrackDraftFromUnknown(
  raw: unknown,
  index: number,
): TrackDraft {
  const source =
    raw !== null && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};
  const id =
    typeof source.id === "string" && source.id.trim() !== ""
      ? source.id
      : `track-${index + 1}`;
  const draft = createTrackDraft({
    amount: stringField(source.amount),
    ratePercent: stringField(source.ratePercent),
    years: stringField(source.years),
    trackType: stringField(source.trackType),
    repaymentMethod: stringField(source.repaymentMethod),
    currentRatePercent: stringField(source.currentRatePercent),
    resetPeriodMonths: stringField(source.resetPeriodMonths),
    forecastMode: stringField(source.forecastMode),
    stressShift: stringField(source.stressShift),
    inflationStressShift: stringField(source.inflationStressShift),
    forecastCurveId: stringField(source.forecastCurveId),
    makamSnapshotId: stringField(source.makamSnapshotId),
  });
  return { ...draft, id };
}

/**
 * Structural validation of a whole input_payload: right shape, right
 * schema version, track count within the product's existing [1,5] bound.
 * Used both when saving (the browser-submitted payload) and when opening
 * a stored scenario (the row's input_payload column) — neither is ever
 * trusted as already well-formed.
 */
export function validateInputPayload(
  raw: unknown,
): StoredScenarioInputPayload | null {
  if (raw === null || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  if (source.schemaVersion !== SCENARIO_SCHEMA_VERSION) return null;
  if (!Array.isArray(source.tracks)) return null;
  if (source.tracks.length < MIN_TRACKS || source.tracks.length > MAX_TRACKS) {
    return null;
  }
  const tracks = source.tracks.map((track, index) =>
    coerceTrackDraftFromUnknown(track, index),
  );
  return { schemaVersion: SCENARIO_SCHEMA_VERSION, tracks };
}

/** Pinned forecast curve IDs across a payload's tracks, deduplicated. */
export function extractPinnedCurveIds(
  payload: StoredScenarioInputPayload,
): string[] {
  return [
    ...new Set(
      payload.tracks
        .map((track) => track.forecastCurveId)
        .filter((id): id is string => id !== ""),
    ),
  ];
}

/** Pinned Makam snapshot IDs across a payload's tracks, deduplicated. */
export function extractPinnedMakamSnapshotIds(
  payload: StoredScenarioInputPayload,
): string[] {
  return [
    ...new Set(
      payload.tracks
        .map((track) => track.makamSnapshotId)
        .filter((id): id is string => id !== ""),
    ),
  ];
}

const RESULT_SNAPSHOT_NUMERIC_FIELDS = [
  "totalPrincipal",
  "firstPayment",
  "highestPayment",
  "highestPaymentMonth",
  "forecastTotalPaid",
  "totalInterestOrFinancingCost",
  "stabilityScore",
  "trackCount",
] as const;

/**
 * Structural guard for a stored row's result_snapshot column. This data
 * is always server-derived (never client-supplied), but is still
 * validated defensively before being used in display math — a future
 * schema change or a hand-edited row should degrade to an inline error,
 * never a crash or silently wrong numbers.
 */
export function isValidResultSnapshot(
  raw: unknown,
): raw is StoredScenarioResultSnapshot {
  if (raw === null || typeof raw !== "object") return false;
  const source = raw as Record<string, unknown>;
  if (source.schemaVersion !== SCENARIO_SCHEMA_VERSION) return false;
  return RESULT_SNAPSHOT_NUMERIC_FIELDS.every(
    (field) =>
      typeof source[field] === "number" && Number.isFinite(source[field]),
  );
}

function isValidMarketReferenceTrack(raw: unknown): boolean {
  if (raw === null || typeof raw !== "object") return false;
  const track = raw as Record<string, unknown>;
  if (typeof track.trackId !== "string") return false;
  if (track.forecastCurveId !== null && typeof track.forecastCurveId !== "string") {
    return false;
  }
  if (track.makamSnapshotId !== null && typeof track.makamSnapshotId !== "string") {
    return false;
  }
  return true;
}

/**
 * Structural guard for a stored row's market_references column — same
 * defense-in-depth rationale as isValidResultSnapshot: this data is
 * always server-derived, but a duplicate action reads a stored row back
 * out and must not propagate a malformed value into a brand-new row.
 */
export function isValidMarketReferences(
  raw: unknown,
): raw is StoredScenarioMarketReferences {
  if (raw === null || typeof raw !== "object") return false;
  const source = raw as Record<string, unknown>;
  if (source.schemaVersion !== SCENARIO_SCHEMA_VERSION) return false;
  if (
    typeof source.boiRatePercent !== "number" ||
    !Number.isFinite(source.boiRatePercent)
  ) {
    return false;
  }
  if (
    typeof source.boiRateEffectiveDate !== "string" ||
    source.boiRateEffectiveDate === ""
  ) {
    return false;
  }
  if (!Array.isArray(source.tracks)) return false;
  return source.tracks.every(isValidMarketReferenceTrack);
}

/** Appended to a scenario's name when duplicating it, in the source
 * scenario's own stored locale — not the caller's current UI locale. */
const DUPLICATE_NAME_SUFFIX: Record<Locale, string> = {
  he: " — עותק",
  en: " — Copy",
};

/**
 * Builds a duplicate's default name: "{name}{suffix}", truncating the
 * ORIGINAL name (never the suffix) if the combined length would exceed
 * the product's 120-character limit, so the "— Copy" marker always stays
 * intact and visible rather than silently disappearing off the end.
 */
export function buildDuplicateName(
  originalName: string,
  locale: unknown,
  maxLength: number = MAX_SCENARIO_NAME_LENGTH,
): string {
  const suffix =
    typeof locale === "string" && isValidLocale(locale)
      ? DUPLICATE_NAME_SUFFIX[locale]
      : DUPLICATE_NAME_SUFFIX[defaultLocale];
  const combined = `${originalName}${suffix}`;
  if (combined.length <= maxLength) return combined;

  const availableForName = Math.max(0, maxLength - suffix.length);
  const truncatedName = originalName.slice(0, availableForName).trimEnd();
  return `${truncatedName}${suffix}`;
}

export interface DuplicateScenarioSource {
  name: string;
  locale: unknown;
  schemaVersion: number;
  calculatorVersion: string;
  inputPayload: StoredScenarioInputPayload;
  resultSnapshot: StoredScenarioResultSnapshot;
  marketReferences: StoredScenarioMarketReferences;
  calculatedAt: string;
}

/**
 * Assembles the row to insert for a duplicate, from an already-validated
 * source scenario. Deliberately never includes `id`, `user_id`,
 * `created_at`, or `updated_at` — the caller adds `user_id` from the
 * authenticated session, and the database supplies a fresh id and
 * timestamps on insert. This is what actually guarantees a duplicate is a
 * distinct new row rather than a copy of the source row's identity.
 */
export function buildDuplicateRow(source: DuplicateScenarioSource) {
  const built = buildDuplicateName(source.name, source.locale);
  const name = validateScenarioName(built) ?? built.slice(0, MAX_SCENARIO_NAME_LENGTH);

  return {
    name,
    schema_version: source.schemaVersion,
    calculator_version: source.calculatorVersion,
    locale: source.locale,
    input_payload: source.inputPayload,
    result_snapshot: source.resultSnapshot,
    market_references: source.marketReferences,
    calculated_at: source.calculatedAt,
  };
}
