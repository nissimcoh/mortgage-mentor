/**
 * Ready-made example mixes for a visitor who has no bank offer yet. They are
 * illustrations: the calculator labels them as such, and the rates are not
 * quotes. The prime track is expressed as a margin under today's prime rate,
 * so it stays plausible when the Bank of Israel rate changes.
 */

import { createTrackDraft, formatAmountForDisplay, type TrackDraft } from "./scenario-form";

export type ExampleMixKind = "threeTracks" | "singleFixed";

const round2 = (value: number) => Math.round(value * 100) / 100;

export function buildExampleMix(kind: ExampleMixKind, primeRatePercent: number): TrackDraft[] {
  const amount = (value: number) => formatAmountForDisplay(String(value));
  if (kind === "singleFixed") {
    return [createTrackDraft({ amount: amount(1_000_000), years: "25", ratePercent: "4.8" })];
  }
  return [
    createTrackDraft({ amount: amount(400_000), years: "25", ratePercent: "4.8" }),
    createTrackDraft({
      amount: amount(400_000), years: "25", trackType: "prime",
      currentRatePercent: String(round2(Math.max(0, primeRatePercent - 0.5))),
    }),
    createTrackDraft({ amount: amount(400_000), years: "20", trackType: "fixedLinked", currentRatePercent: "3.5" }),
  ];
}
