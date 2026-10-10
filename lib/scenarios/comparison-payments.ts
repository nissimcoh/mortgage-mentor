import { calculateScenarioSummary } from "../mortgage/calculations";
import { CALCULATOR_VERSION } from "../mortgage/calculator-version";
import { parseAllTrackDrafts, type MarketContextForParsing } from "../mortgage/scenario-form";
import { toComparisonScenario, type ComparisonRow } from "./comparison";
import { isValidMarketReferences, validateInputPayload } from "./payload";
import { buildResultSnapshot } from "./snapshot";

/** Reconstruct only the saved context. Never substitute today's curve or BOI rate. */
export function reconstructComparisonPayments(row: ComparisonRow, market: Omit<MarketContextForParsing, "boiRatePercent">): number[] | null {
  const scenario = toComparisonScenario(row);
  const payload = validateInputPayload(row.input_payload);
  if (!scenario || !payload || row.calculator_version !== CALCULATOR_VERSION) return null;
  const needsMarket = payload.tracks.some(track => track.trackType !== "fixedUnlinked");
  const refs = isValidMarketReferences(row.market_references) ? row.market_references : null;
  if (needsMarket && !refs) return null;
  const tracks = payload.tracks.map(track => {
    if (track.trackType === "fixedUnlinked") return track;
    const matches = refs!.tracks.filter(ref => ref.trackId === track.id);
    const ref = matches[0];
    if (matches.length !== 1 || !ref.forecastCurveId || (track.trackType === "variableMakam" && !ref.makamSnapshotId)) return null;
    return { ...track, forecastCurveId: ref.forecastCurveId, makamSnapshotId: ref.makamSnapshotId ?? "" };
  });
  if (tracks.some(track => track === null)) return null;
  const inputs = parseAllTrackDrafts(tracks.filter(track => track !== null), {
    ...market, boiRatePercent: refs?.boiRatePercent ?? 0,
  });
  if (!inputs) return null;
  try {
    const summary = calculateScenarioSummary({ tracks: inputs });
    const computed = buildResultSnapshot(inputs, summary);
    const saved = scenario.result;
    // Old methodologies or revised source data must not silently disagree with the table.
    const moneyFields = ["totalPrincipal", "firstPayment", "highestPayment", "forecastTotalPaid", "totalInterestOrFinancingCost"] as const;
    if (moneyFields.some(field => Math.abs(computed[field] - saved[field]) >= 0.005) ||
        computed.highestPaymentMonth !== saved.highestPaymentMonth) return null;
    const payments = summary.combinedSchedule.map(entry => entry.payment);
    if (payments.length !== scenario.years * 12 || payments.some(value => !Number.isFinite(value) || value < 0) ||
        Math.abs(payments.reduce((sum, value) => sum + value, 0) - saved.forecastTotalPaid) >= 0.005) return null;
    return payments;
  } catch {
    return null;
  }
}

