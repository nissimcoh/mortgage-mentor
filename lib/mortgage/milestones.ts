import type { MortgageTrackInput } from "./types";

export interface MortgageMilestone {
  month: number;
  events: { trackIndex: number; kind: "reset" | "end" }[];
}

/** Rate resets start in V+1; an end marker denotes the final payment itself. */
export function buildMortgageMilestones(tracks: readonly MortgageTrackInput[]): MortgageMilestone[] {
  const grouped = new Map<number, MortgageMilestone["events"]>();
  const add = (month: number, trackIndex: number, kind: "reset" | "end") => {
    const events = grouped.get(month) ?? [];
    events.push({ trackIndex, kind });
    grouped.set(month, events);
  };
  tracks.forEach((track, trackIndex) => {
    const months = Math.round(track.years * 12);
    if ("resetPeriodMonths" in track && track.resetPeriodMonths > 0) {
      for (let month = track.resetPeriodMonths + 1; month <= months; month += track.resetPeriodMonths) {
        add(month, trackIndex, "reset");
      }
    }
    // Prime and CPI do not have scheduled fixed blocks; never invent reset dates.
    add(months, trackIndex, "end");
  });
  return [...grouped].sort(([a], [b]) => a - b).map(([month, events]) => ({ month, events }));
}
