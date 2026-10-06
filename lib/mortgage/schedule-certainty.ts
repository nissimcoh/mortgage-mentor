import type { MortgageTrackInput } from "./types";

export type ScheduleBasis = "contractual" | "rate" | "index" | "rateAndIndex";

/** Classify dependencies, not numerical changes: flat forecasts are still estimates. */
export function scheduleBasisForMonth(
  tracks: readonly MortgageTrackInput[],
  month: number,
): ScheduleBasis {
  let rate = false;
  let index = false;
  for (const track of tracks) {
    if (month > Math.round(track.years * 12)) continue;
    switch (track.type) {
      case "prime":
        rate = true;
        break;
      case "variableGovernmentBond":
      case "variableMakam":
        rate ||= month > track.resetPeriodMonths;
        break;
      case "fixedLinked":
        index = true;
        break;
      case "variableLinked":
        index = true;
        rate ||= month > track.resetPeriodMonths;
        break;
    }
  }
  return rate && index ? "rateAndIndex" : rate ? "rate" : index ? "index" : "contractual";
}
