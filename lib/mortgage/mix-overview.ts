/**
 * Live facts about the mix while the user is still typing: how much has been
 * entered, each track's share, and how much of it is at a fixed rate.
 *
 * The fixed-rate share is compared with the Bank of Israel rule that at
 * least a third of a mortgage must be at a fixed rate. It is a reading aid,
 * not a compliance check: how each product is counted is set by the
 * directive and by the bank.
 */

import { parseWholeAmount } from "@/lib/forms/numeric";
import type { TrackDraft } from "./scenario-form";

/** Track types whose interest rate does not change for the whole term. */
const FIXED_RATE_TRACK_TYPES: ReadonlySet<string> = new Set(["fixedUnlinked", "fixedLinked"]);

export interface MixOverview {
  /** Sum of the amounts that currently parse, in whole shekels. */
  total: number;
  /** Each draft's share of the total (0..1), in draft order; 0 without a valid amount. */
  shares: number[];
  /** Share of the total on fixed-rate tracks (0..1). */
  fixedShare: number;
  /** True when at least a third of the entered total is at a fixed rate. */
  meetsFixedThird: boolean;
}

export function summarizeMix(drafts: readonly Pick<TrackDraft, "amount" | "trackType">[]): MixOverview {
  const amounts = drafts.map((draft) => {
    const amount = parseWholeAmount(draft.amount);
    return amount !== null && amount > 0 ? amount : 0;
  });
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const fixed = amounts.reduce(
    (sum, amount, index) => (FIXED_RATE_TRACK_TYPES.has(drafts[index].trackType) ? sum + amount : sum), 0);
  return {
    total,
    shares: amounts.map((amount) => (total > 0 ? amount / total : 0)),
    fixedShare: total > 0 ? fixed / total : 0,
    // Whole shekels on both sides, so exactly one third passes.
    meetsFixedThird: total > 0 && fixed * 3 >= total,
  };
}
