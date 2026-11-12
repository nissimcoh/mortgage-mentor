import { describe, expect, it } from "vitest";
import { buildExampleMix } from "../example-mixes";
import { summarizeMix } from "../mix-overview";
import { validateTrackDraft } from "../scenario-form";

const track = (amount: string, trackType: string) => ({ amount, trackType });

describe("summarizeMix", () => {
  it("is empty until an amount parses", () => {
    expect(summarizeMix([track("", "fixedUnlinked")])).toEqual({ total: 0, shares: [0], fixedShare: 0, meetsFixedThird: false });
    expect(summarizeMix([track("12.5", "prime")]).total).toBe(0);
  });

  it("reports each track's share and ignores tracks without a valid amount", () => {
    const mix = summarizeMix([track("600,000", "fixedUnlinked"), track("300000", "prime"), track("", "prime"), track("abc", "prime")]);
    expect(mix.total).toBe(900_000);
    expect(mix.shares[0]).toBeCloseTo(2 / 3);
    expect(mix.shares[1]).toBeCloseTo(1 / 3);
    expect(mix.shares.slice(2)).toEqual([0, 0]);
  });

  it("counts fixed unlinked and fixed CPI-linked tracks as fixed rate", () => {
    const mix = summarizeMix([track("200,000", "fixedUnlinked"), track("200,000", "fixedLinked"), track("600,000", "prime")]);
    expect(mix.fixedShare).toBeCloseTo(0.4);
    expect(mix.meetsFixedThird).toBe(true);
  });

  it("does not count variable tracks as fixed rate", () => {
    for (const type of ["prime", "variableLinked", "variableGovernmentBond", "variableMakam"]) {
      expect(summarizeMix([track("500,000", type)]).fixedShare).toBe(0);
    }
  });

  it("passes at exactly one third and fails just below it", () => {
    expect(summarizeMix([track("300,000", "fixedUnlinked"), track("600,000", "prime")]).meetsFixedThird).toBe(true);
    expect(summarizeMix([track("299,999", "fixedUnlinked"), track("600,001", "prime")]).meetsFixedThird).toBe(false);
  });
});

describe("buildExampleMix", () => {
  it.each(["threeTracks", "singleFixed"] as const)("builds a %s example whose fields all validate", (kind) => {
    const drafts = buildExampleMix(kind, 4.75);
    for (const draft of drafts) expect(validateTrackDraft(draft)).toEqual({});
    expect(summarizeMix(drafts).meetsFixedThird).toBe(true);
    expect(new Set(drafts.map((draft) => draft.id)).size).toBe(drafts.length);
  });

  it("prices the prime track as a margin under today's prime rate and never below zero", () => {
    expect(buildExampleMix("threeTracks", 4.75)[1].currentRatePercent).toBe("4.25");
    expect(buildExampleMix("threeTracks", 6.1)[1].currentRatePercent).toBe("5.6");
    expect(buildExampleMix("threeTracks", 0.2)[1].currentRatePercent).toBe("0");
  });

  it("totals a round amount", () => {
    expect(summarizeMix(buildExampleMix("threeTracks", 4.75)).total).toBe(1_200_000);
    expect(summarizeMix(buildExampleMix("singleFixed", 4.75)).total).toBe(1_000_000);
  });
});
