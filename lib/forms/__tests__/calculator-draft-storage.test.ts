// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTrackDraft } from "@/lib/mortgage/scenario-form";
import { CALCULATOR_DRAFT_KEY, draftSource, parseCalculatorDraft, readDraftSnapshot, rememberCalculatorDraft, subscribeDraft } from "../calculator-draft";

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());
function serialized() {
  rememberCalculatorDraft("normal", "", [createTrackDraft({ amount: "123" })]);
  return JSON.parse(sessionStorage.getItem(CALCULATOR_DRAFT_KEY)!);
}

it("rejects empty, excessive, wrong-typed and oversized draft data", () => {
  const saved = serialized();
  for (const tracks of [[], Array(6).fill(saved.tracks[0]), [{ ...saved.tracks[0], amount: 123 }], [{ ...saved.tracks[0], amount: "1".repeat(201) }]]) {
    expect(parseCalculatorDraft(JSON.stringify({ ...saved, tracks }))).toBeNull();
  }
  expect(parseCalculatorDraft(" ".repeat(64001))).toBeNull();
  expect(parseCalculatorDraft("null")).toBeNull();
});

it("assigns distinct UI identities and drops all unexpected stored fields", () => {
  const saved = serialized();
  const untrusted = { ...saved.tracks[0], id: "same", user_id: "other", result_snapshot: { totalPrincipal: 1 } };
  const recovered = parseCalculatorDraft(JSON.stringify({ ...saved, tracks: [untrusted, untrusted] }))!;
  expect(new Set(recovered.tracks.map(track => track.id)).size).toBe(2);
  expect(recovered.tracks.every(track => track.id !== "same")).toBe(true);
  expect(recovered.tracks[0]).not.toHaveProperty("user_id");
  expect(recovered.tracks[0]).not.toHaveProperty("result_snapshot");
});

it("normalizes query ordering without including edit names, tokens or tracking parameters", () => {
  const a = draftSource(new URLSearchParams("track1Amount=900&trackCount=1&savedScenarioName=Private&token=secret&utm_source=test"));
  const b = draftSource(new URLSearchParams("trackCount=1&track1Amount=900"));
  expect(a).toBe(b);
  expect(draftSource(new URLSearchParams("loanAmount=900&trackType=prime"))).toContain("trackType=prime");
  expect(a).not.toMatch(/Private|secret|utm/);
});

it("tolerates blocked reads and unregisters listeners when consumers unmount", () => {
  const listener = vi.fn();
  const stop = subscribeDraft(listener);
  rememberCalculatorDraft("normal", "", [createTrackDraft()]);
  expect(listener).toHaveBeenCalledOnce();
  stop();
  rememberCalculatorDraft("normal", "", [createTrackDraft({ amount: "9" })]);
  expect(listener).toHaveBeenCalledOnce();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
  expect(readDraftSnapshot()).toBeNull();
});
