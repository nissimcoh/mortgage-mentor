import { parseWholeAmount } from "../forms/numeric";
import { validateTrackDraft } from "../mortgage/scenario-form";
import type { StoredScenarioResultSnapshot } from "./contract";
import { isUuidLike, isValidMarketReferences, isValidResultSnapshot, validateInputPayload } from "./payload";

/** Small, validated projection: never sends raw payloads or curve arrays to the browser. */
export interface ComparisonScenario {
  id: string;
  name: string;
  calculatedAt: string;
  result: StoredScenarioResultSnapshot;
  years: number;
  rateExposure: number;
  cpiExposure: number;
  fixedShare: number;
  forecastSignature: string | null;
  customForecast: boolean;
}

export interface ComparisonRow {
  id: string;
  name: string;
  calculated_at: string;
  input_payload: unknown;
  result_snapshot: unknown;
  market_references: unknown;
}

const TYPES = new Set(["fixedUnlinked", "fixedLinked", "variableLinked", "prime", "variableGovernmentBond", "variableMakam"]);

export function toComparisonScenario(row: ComparisonRow): ComparisonScenario | null {
  const payload = validateInputPayload(row.input_payload);
  if (!isUuidLike(row.id) || !payload || !isValidResultSnapshot(row.result_snapshot)) return null;
  const tracks = payload.tracks;
  if (tracks.some(track => !TYPES.has(track.trackType) || Object.keys(validateTrackDraft(track)).length > 0 ||
      !["spitzer", "equalPrincipal"].includes(track.repaymentMethod) ||
      (track.trackType !== "fixedUnlinked" && !["official", "constant", "stress"].includes(track.forecastMode)))) return null;

  const amounts = tracks.map(track => parseWholeAmount(track.amount)!);
  const principal = amounts.reduce((sum, amount) => sum + amount, 0);
  const result = row.result_snapshot;
  if (principal <= 0 || Math.abs(principal - result.totalPrincipal) > 0.01 || result.trackCount !== tracks.length) return null;
  const share = (types: string[]) => tracks.reduce((sum, track, index) => sum + (types.includes(track.trackType) ? amounts[index] : 0), 0) / principal;
  const forecastTracks = tracks.filter(track => track.trackType !== "fixedUnlinked");
  let forecastSignature: string | null = null;
  if (forecastTracks.length) {
    const refs = row.market_references;
    if (!isValidMarketReferences(refs) || forecastTracks.some(track => !refs.tracks.some(ref =>
      ref.trackId === track.id && ref.forecastCurveId && (track.trackType !== "variableMakam" || ref.makamSnapshotId)))) {
      forecastSignature = "unknown";
    } else {
      const ids = new Set(forecastTracks.flatMap(track => {
        const ref = refs.tracks.find(ref => ref.trackId === track.id)!;
        return [ref.forecastCurveId!, ...(track.trackType === "variableMakam" ? [`makam:${ref.makamSnapshotId}`] : [])];
      }));
      if (forecastTracks.some(track => track.trackType === "prime")) ids.add(`boi:${refs.boiRatePercent}:${refs.boiRateEffectiveDate}`);
      forecastSignature = [...ids].sort().join("|");
    }
  }
  return {
    id: row.id, name: row.name, calculatedAt: row.calculated_at, result,
    years: Math.max(...tracks.map(track => Number(track.years))),
    rateExposure: share(["prime", "variableGovernmentBond", "variableMakam", "variableLinked"]),
    cpiExposure: share(["fixedLinked", "variableLinked"]),
    fixedShare: share(["fixedUnlinked"]),
    forecastSignature,
    customForecast: forecastTracks.some(track => track.forecastMode !== "official"),
  };
}

/** Selection IDs are resolved only against the already ownership-scoped list. */
export function resolveComparisonSelection(scenarios: ComparisonScenario[], ids: readonly string[]): ComparisonScenario[] {
  return [...new Set(ids)].slice(0, 3).flatMap(id => {
    const scenario = scenarios.find(item => item.id === id);
    return scenario ? [scenario] : [];
  });
}

export function comparisonWarnings(scenarios: ComparisonScenario[]) {
  const signatures = scenarios.map(item => item.forecastSignature).filter(value => value !== null);
  return {
    differentTerms: scenarios.some(item => item.years !== scenarios[0]?.years || item.result.totalPrincipal !== scenarios[0]?.result.totalPrincipal),
    differentForecasts: signatures.includes("unknown") || new Set(signatures).size > 1,
    customForecast: scenarios.some(item => item.customForecast),
  };
}
