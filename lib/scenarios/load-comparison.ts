import { getMortgageForecastData } from "../market-data/sources/boi-mortgage-forecast";
import { getMakamAnchorData } from "../market-data/sources/boi-makam";
import { toComparisonScenario, type ComparisonRow } from "./comparison";
import { reconstructComparisonPayments } from "./comparison-payments";
import { isValidMarketReferences, validateInputPayload } from "./payload";

/** Columns every comparison loader selects. */
export const COMPARISON_COLUMNS = "id, name, input_payload, result_snapshot, market_references, calculated_at, calculator_version";

/** Call only with rows already scoped to the authenticated user. No user data cache.
 *
 * Reconstructing payments means a full schedule per mix plus the pinned
 * historical curves, so it runs only for `withPaymentsFor` (default: the two
 * mixes the page selects first). The rest arrive without `payments` and the
 * browser requests them via loadComparisonPayments when they are selected. */
export async function loadComparisonScenarios(rows: ComparisonRow[], withPaymentsFor?: readonly string[]) {
  const valid = rows.flatMap(row => {
    const scenario = toComparisonScenario(row);
    return scenario ? [{ row, scenario }] : [];
  });
  const wanted = new Set(withPaymentsFor ?? valid.slice(0, 2).map(({ row }) => row.id));
  const refs = valid.filter(({ row }) => wanted.has(row.id)).flatMap(({ row }) => {
    const payload = validateInputPayload(row.input_payload)!;
    if (!isValidMarketReferences(row.market_references)) return [];
    return row.market_references.tracks.filter(ref => payload.tracks.some(track => track.id === ref.trackId && track.trackType !== "fixedUnlinked"));
  });
  const curveIds = [...new Set(refs.flatMap(ref => ref.forecastCurveId ? [ref.forecastCurveId] : []))];
  const makamIds = [...new Set(refs.flatMap(ref => ref.makamSnapshotId ? [ref.makamSnapshotId] : []))];
  const [forecast, makam] = await Promise.allSettled([
    curveIds.length ? getMortgageForecastData(curveIds) : Promise.resolve({ curves: [] }),
    makamIds.length ? getMakamAnchorData(makamIds) : Promise.resolve({ snapshots: [] }),
  ]);
  const market = {
    curves: forecast.status === "fulfilled" ? forecast.value.curves : [],
    makamSnapshots: makam.status === "fulfilled" ? makam.value.snapshots : [],
  };
  return valid.map(({ row, scenario }) => wanted.has(row.id)
    ? { ...scenario, payments: reconstructComparisonPayments(row, market) }
    : { ...scenario, payments: undefined });
}
