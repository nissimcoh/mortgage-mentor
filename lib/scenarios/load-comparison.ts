import { getMortgageForecastData } from "../market-data/sources/boi-mortgage-forecast";
import { getMakamAnchorData } from "../market-data/sources/boi-makam";
import { toComparisonScenario, type ComparisonRow } from "./comparison";
import { reconstructComparisonPayments } from "./comparison-payments";
import { isValidMarketReferences, validateInputPayload } from "./payload";

/** Call only with rows already scoped to the authenticated user. No user data cache. */
export async function loadComparisonScenarios(rows: ComparisonRow[]) {
  const valid = rows.flatMap(row => {
    const scenario = toComparisonScenario(row);
    return scenario ? [{ row, scenario }] : [];
  });
  const refs = valid.flatMap(({ row }) => {
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
  return valid.map(({ row, scenario }) => ({ ...scenario, payments: reconstructComparisonPayments(row, market) }));
}
