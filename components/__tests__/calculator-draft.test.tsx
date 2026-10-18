// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import MortgageCalculator from "../MortgageCalculator";
import he from "@/app/[locale]/dictionaries/he.json";
import en from "@/app/[locale]/dictionaries/en.json";
import { CALCULATOR_DRAFT_KEY, draftSource, parseCalculatorDraft, rememberCalculatorDraft } from "@/lib/forms/calculator-draft";
import { updateScenario } from "@/lib/scenarios/actions";
import { createTrackDraft } from "@/lib/mortgage/scenario-form";
import { mount, unmount, rerender, click, type, button, submit } from "./dom-helpers";

const mocks = vi.hoisted(() => ({ query: "", replace: vi.fn(), locale: "he" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), usePathname: () => `/${mocks.locale}/calculator`, useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("@/lib/scenarios/actions", () => ({ createScenario: vi.fn(), updateScenario: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn(() => ({auth:{getSession:async()=>({data:{session:{user:{id:"test-only"}}}})}})) }));
vi.mock("../AmortizationSchedule", () => ({ default: () => null }));
const marketData = { boiRatePercent: 3.25, boiRateEffectiveDate: "2026-09-03", boiRateStatus: "live" as const, boiNextDecisionAt: null, marketFetchedAt: "2026-10-17T08:00:00Z", curves: [], curveStatus: "live" as const, makamSnapshots: [], makamStatus: "live" as const };
const calculator = (context: { id: string; name: string; updatedAt: string } | null = null, data = marketData) => {
  const dict = mocks.locale === "he" ? he : en;
  return <MortgageCalculator locale={mocks.locale === "he" ? "he" : "en"} labels={dict.calculator} marketData={data} saveScenarioLabels={dict.saveScenarioDialog} editScenarioLabels={dict.editScenarioDialog} editContext={context} editContextUnavailable={false} />;
};
const amount = () => document.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
beforeEach(() => { mocks.query = ""; mocks.locale = "he"; mocks.replace.mockReset(); sessionStorage.clear(); window.history.replaceState(null, "", "/he/calculator"); Element.prototype.scrollIntoView = vi.fn(); });
afterEach(async () => { await unmount(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("keeps partial inputs across remount and language switch, offers recovery, and clears on request", async () => {
  await mount(calculator());
  await type(amount(), "712345");
  const raw = sessionStorage.getItem(CALCULATOR_DRAFT_KEY)!;
  expect(parseCalculatorDraft(raw)!.tracks[0].amount).toBe("712,345");
  expect(raw).not.toContain('"id"');
  await unmount();
  mocks.locale = "en";
  await mount(calculator());
  expect(amount().value).toBe("");
  await click(button(en.calculator.draftRestore));
  expect(amount().value).toBe("712,345");
  expect(document.querySelector("#results")).toBeNull();
  await click(button(en.calculator.draftClear));
  expect(amount().value).toBe("");
  expect(sessionStorage.getItem(CALCULATOR_DRAFT_KEY)).toBeNull();
});

it("does not replace an explicit different shared scenario or another saved scenario", async () => {
  const draft = createTrackDraft({ amount: "123", ratePercent: "4.", forecastCurveId: "pinned-history" });
  rememberCalculatorDraft("normal", "trackCount=1&track1Amount=500", [draft]);
  mocks.query = "trackCount=1&track1Amount=900";
  await mount(calculator());
  expect(document.body.textContent).not.toContain(he.calculator.draftFound);
  expect(amount().value).toBe("900");
  await unmount();
  mocks.query = "";
  await mount(calculator({ id: "another-id", name: "Scenario", updatedAt: "2026-10-17T08:00:00Z" }));
  expect(document.body.textContent).not.toContain(he.calculator.draftFound);
});

it("restores partial rate text and asks the server for pinned history without restoring authorization metadata", async () => {
  rememberCalculatorDraft("normal", "", [createTrackDraft({ trackType: "prime", amount: "500,000", currentRatePercent: "4.", years: "25", forecastCurveId: "2026-06-calendar" })]);
  await mount(calculator());
  await click(button(he.calculator.draftRestore));
  expect(Array.from(document.querySelectorAll("input")).some(input => input.value === "4.")).toBe(true);
  expect(mocks.replace.mock.calls.at(-1)![0]).toContain("track1ForecastCurveId=2026-06-calendar");
  expect(mocks.replace.mock.calls.at(-1)![0]).not.toContain("savedScenario");
});

it("ignores malformed storage and remains usable when storage is denied", async () => {
  for (const raw of ['{', '{"version":99}', JSON.stringify({ version: 1, scope: "normal", source: "", tracks: Array(6).fill({}) })]) expect(parseCalculatorDraft(raw)).toBeNull();
  sessionStorage.setItem(CALCULATOR_DRAFT_KEY, "{");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
  await mount(calculator());
  await type(amount(), "12345");
  expect(amount().value).toBe("12,345");
  expect(document.body.textContent).toContain(he.calculator.draftStorageUnavailable);
});

it("discards a stored draft without changing the URL's current inputs", async () => {
  mocks.query = "trackCount=1&track1Amount=900";
  rememberCalculatorDraft("normal", draftSource(new URLSearchParams(mocks.query)), [createTrackDraft({ amount: "123" })]);
  await mount(calculator());
  await click(button(he.calculator.draftDiscard));
  expect(amount().value).toBe("900");
  expect(sessionStorage.getItem(CALCULATOR_DRAFT_KEY)).toBeNull();
  expect(mocks.replace).not.toHaveBeenCalled();
  await act(async () => {});
});

it("updates shareable calculation URLs locally without a server round trip or new history entries", async () => {
  mocks.query = "trackCount=1&track1Amount=800000&track1Years=25&track1Type=fixedUnlinked&track1RepaymentMethod=spitzer&track1AnnualInterestRatePercent=4.8";
  const initialHistoryLength = window.history.length;
  await mount(calculator());
  const form = document.querySelector("form")!;
  for (let i = 0; i < 10; i++) await submit(form);
  expect(document.querySelector("#results")).not.toBeNull();
  expect(window.location.search).toContain("track1Amount=800000");
  expect(window.location.search).toContain("track1AnnualInterestRatePercent=4.8");
  expect(window.history.length).toBe(initialHistoryLength);
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});

it("does not offer recovery when the URL already contains exactly the stored draft", async () => {
  mocks.query = "trackCount=1&track1Amount=900&track1Type=fixedUnlinked&track1RepaymentMethod=spitzer";
  rememberCalculatorDraft("normal", draftSource(new URLSearchParams(mocks.query)), [createTrackDraft({ amount: "900" })]);
  await mount(calculator());
  expect(amount().value).toBe("900");
  expect(document.body.textContent).not.toContain(he.calculator.draftFound);
});

it("cannot recover edit permissions or an optimistic concurrency token from browser storage", async () => {
  rememberCalculatorDraft("normal", "", [createTrackDraft({ amount: "123" })]);
  const stored = JSON.parse(sessionStorage.getItem(CALCULATOR_DRAFT_KEY)!);
  sessionStorage.setItem(CALCULATOR_DRAFT_KEY, JSON.stringify({ ...stored, savedScenarioId: "forged", expectedUpdatedAt: "2099-01-01" }));
  await mount(calculator());
  await click(button(he.calculator.draftRestore));
  expect(mocks.replace.mock.calls.at(-1)![0]).not.toContain("forged");
  expect(document.body.textContent).not.toContain(he.calculator.editModeExitLabel);
});

it("persists track additions and clear locally while keeping explicit recovery server-backed", async () => {
  await mount(calculator());
  await click(button(he.calculator.addTrack));
  expect(window.location.search).toContain("trackCount=2");
  expect(parseCalculatorDraft(sessionStorage.getItem(CALCULATOR_DRAFT_KEY))!.tracks).toHaveLength(2);
  expect(mocks.replace).not.toHaveBeenCalled();
  await click(button(he.calculator.draftClear));
  expect(window.location.search).toContain("trackCount=1");
  expect(sessionStorage.getItem(CALCULATOR_DRAFT_KEY)).toBeNull();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("refreshes after Israeli midnight, keeps pending edits on the router, then resumes local updates", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-17T20:59:59Z"));
  await mount(calculator());
  await click(button(he.calculator.addTrack));
  expect(mocks.replace).not.toHaveBeenCalled();
  vi.setSystemTime(new Date("2026-10-17T21:00:00Z"));
  await click(button(he.calculator.addTrack));
  expect(mocks.replace).toHaveBeenCalledOnce();
  await click(button(he.calculator.addTrack));
  expect(mocks.replace).toHaveBeenCalledTimes(2);
  expect(mocks.replace.mock.calls.at(-1)![0]).toContain("trackCount=4");
  await rerender(calculator(null, { ...marketData, marketFetchedAt: "2026-10-17T21:00:00Z" }));
  await click(button(he.calculator.addTrack));
  expect(mocks.replace).toHaveBeenCalledTimes(2);
  expect(window.location.search).toContain("trackCount=5");
});


it.each(["500,000.50", "-500000", "4,5", "9007199254740992"])("preserves invalid pasted amount %s and focuses its associated error", async raw => {
  await mount(calculator());
  await type(amount(), raw);
  expect(amount().value).toBe(raw);
  await submit(document.querySelector("form")!);
  expect(document.activeElement).toBe(amount());
  expect(amount().getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(amount().getAttribute("aria-describedby")!)?.textContent).toBe(he.calculator.fieldErrorAmountInvalid);
  expect(document.querySelector("#results")).toBeNull();
});

it.each(["he", "en"])("focuses successive invalid fields on repeated submission and removes corrected errors (%s)", async locale => {
  mocks.locale = locale;
  await mount(calculator());
  const form = document.querySelector("form")!;
  await submit(form);
  expect(document.activeElement).toBe(amount());
  const oldErrorId = amount().getAttribute("aria-describedby")!;
  await type(amount(), "500000");
  expect(amount().hasAttribute("aria-invalid")).toBe(false);
  expect(document.getElementById(oldErrorId)).toBeNull();
  await submit(form);
  const next = document.activeElement!;
  expect(next).not.toBe(amount());
  expect(next.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(next.getAttribute("aria-describedby")!)).not.toBeNull();
  await click(button(locale === "he" ? he.calculator.addTrack : en.calculator.addTrack));
  const described = Array.from(document.querySelectorAll('[aria-describedby]')).map(el => el.getAttribute('aria-describedby'));
  expect(new Set(described).size).toBe(described.length);
});


it("focuses and describes missing reset frequency, then the missing term, without duplicate error IDs", async () => {
  await mount(calculator());
  await type(amount(), "500000");
  const typeSelect = Array.from(document.querySelectorAll("select")).find(el => el.value === "fixedUnlinked")!;
  await act(async () => { typeSelect.value = "variableGovernmentBond"; typeSelect.dispatchEvent(new Event("change", {bubbles:true})); });
  const rate = document.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
  await type(rate, "4.5");
  await submit(document.querySelector("form")!);
  const group = document.querySelector<HTMLElement>('[role="radiogroup"]')!;
  expect(document.activeElement).toBe(group);
  expect(document.getElementById(group.getAttribute("aria-describedby")!)?.textContent).toBe(he.calculator.fieldErrorResetPeriodInvalid);
  const nameId = amount().getAttribute("aria-labelledby")!;
  expect(document.getElementById(nameId)?.textContent).toBe(he.calculator.trackAmountLabel);
  await click(group.querySelector<HTMLButtonElement>('button[role="radio"]')!);
  expect(group.hasAttribute("aria-invalid")).toBe(false);
  await submit(document.querySelector("form")!);
  expect(document.activeElement?.tagName).toBe("SELECT");
  expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
});


it("updates twice without remounting using each returned concurrency token and canonical name", async () => {
  mocks.query = "trackCount=1&track1Amount=500000&track1Years=20&track1Type=fixedUnlinked&track1RepaymentMethod=spitzer&track1AnnualInterestRatePercent=4.5";
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const update = vi.mocked(updateScenario);
  update.mockReset();
  update.mockResolvedValueOnce({ok:true, name:"Renamed", updatedAt:"2026-10-18T10:01:00.123456+00:00"})
    .mockResolvedValueOnce({ok:true, name:"Renamed again", updatedAt:"2026-10-18T10:02:00.654321+00:00"});
  await mount(calculator({id:"saved-id",name:"Original",updatedAt:"2026-10-18T10:00:00Z"}));
  await click(button(he.calculator.saveScenarioButton));
  await type(document.querySelector<HTMLInputElement>('dialog input')!, "Renamed");
  await click(button(he.editScenarioDialog.updateOriginalButton));
  expect(update.mock.calls[0][0]).toMatchObject({id:"saved-id", expectedUpdatedAt:"2026-10-18T10:00:00Z",name:"Renamed"});
  expect(document.body.textContent).toContain("Renamed");
  await type(amount(), "550000");
  await submit(document.querySelector("form")!);
  await click(button(he.calculator.saveScenarioButton));
  expect(document.querySelector<HTMLInputElement>('dialog input')!.value).toBe("Renamed");
  await click(button(he.editScenarioDialog.updateOriginalButton));
  expect(update.mock.calls[1][0]).toMatchObject({id:"saved-id",expectedUpdatedAt:"2026-10-18T10:01:00.123456+00:00",name:"Renamed"});
  expect(document.body.textContent).toContain("Renamed again");
});
