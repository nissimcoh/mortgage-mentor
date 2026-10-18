// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SaveScenarioButton from "../SaveScenarioButton";
import EditScenarioSaveButton from "../EditScenarioSaveButton";
import ScenarioActionsMenu from "../ScenarioActionsMenu";
import he from "@/app/[locale]/dictionaries/he.json";
import { createTrackDraft } from "@/lib/mortgage/scenario-form";
import { mount, unmount, click, button, submit, cancelDialog } from "./dom-helpers";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), rename: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }), usePathname: () => "/he/calculator", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: "test-only" } } } }) } }) }));
vi.mock("@/lib/scenarios/actions", () => ({ createScenario: mocks.create, updateScenario: mocks.update, renameScenario: mocks.rename, deleteScenario: vi.fn(), duplicateScenario: vi.fn() }));
const drafts = [createTrackDraft({ amount: "500000" })];
const editContext = { id: "saved-id", name: "Original", expectedUpdatedAt: "2026-10-17T08:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks();
  // jsdom does not implement native modal focus containment; real-browser QA
  // exercises it. This shim supports only lifecycle and return-focus tests.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([new DOMRect()] as unknown as DOMRectList);
});
afterEach(async () => { await unmount(); vi.restoreAllMocks(); });

it("wraps Tab and Shift+Tab at the modal boundaries", async () => {
  await mount(<SaveScenarioButton locale="he" buttonLabel="Save" drafts={drafts} labels={he.saveScenarioDialog} />);
  await click(button("Save"));
  const first = document.querySelector<HTMLAnchorElement>("dialog a")!;
  const last = button(he.saveScenarioDialog.saveButton);
  await act(async () => {
    last.focus();
    last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  });
  expect(document.activeElement).toBe(first);
  await act(async () => {
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
  });
  expect(document.activeElement).toBe(last);
});

it("focuses the name, saves on form submission once, blocks Escape while pending and restores focus", async () => {
  let resolve!: (value: { ok: true; id: string }) => void;
  mocks.create.mockReturnValue(new Promise(done => { resolve = done; }));
  await mount(<SaveScenarioButton locale="he" buttonLabel="Save" drafts={drafts} labels={he.saveScenarioDialog} />);
  const opener = button("Save");
  await click(opener);
  expect(document.activeElement?.id).toBe("save-scenario-name");
  await submit();
  await submit();
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(document.activeElement?.tagName).toBe("DIALOG");
  await cancelDialog();
  expect(document.querySelector("dialog")).not.toBeNull();
  await act(async () => { resolve({ ok: true, id: "new-id" }); });
  expect(document.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it("recovers from a rejected save, permits retry and closes with Escape", async () => {
  mocks.create.mockRejectedValueOnce(new Error("network"));
  await mount(<SaveScenarioButton locale="he" buttonLabel="Save" drafts={drafts} labels={he.saveScenarioDialog} />);
  await click(button("Save"));
  await submit();
  expect(document.body.textContent).toContain(he.saveScenarioDialog.genericErrorMessage);
  expect(document.activeElement?.id).toBe("save-scenario-name");
  expect(button(he.saveScenarioDialog.saveButton).disabled).toBe(false);
  await cancelDialog();
  expect(document.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(button("Save"));
});

it("requires an explicit edit choice before Enter can save a copy", async () => {
  mocks.create.mockResolvedValue({ ok: true, id: "copy" });
  await mount(<EditScenarioSaveButton locale="he" buttonLabel="Save edits" drafts={drafts} editContext={editContext} onUpdated={() => {}} labels={he.editScenarioDialog} saveScenarioLabels={he.saveScenarioDialog} />);
  await click(button("Save edits"));
  expect(document.activeElement?.id).toBe("edit-scenario-name");
  await submit();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  await click(button(he.editScenarioDialog.saveAsNewButton));
  await submit();
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button("Save edits"));
});

it("uses the captured concurrency token for an explicitly chosen update", async () => {
  mocks.update.mockResolvedValue({ ok: false, error: "scenario-changed" });
  await mount(<EditScenarioSaveButton locale="he" buttonLabel="Save edits" drafts={drafts} editContext={editContext} onUpdated={() => {}} labels={he.editScenarioDialog} saveScenarioLabels={he.saveScenarioDialog} />);
  await click(button("Save edits"));
  await click(button(he.editScenarioDialog.updateOriginalButton));
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: editContext.id, expectedUpdatedAt: editContext.expectedUpdatedAt }));
  expect(document.body.textContent).toContain(he.editScenarioDialog.scenarioChangedMessage);
  expect(document.querySelector("dialog")).not.toBeNull();
});

it("renames on Enter and returns to the persistent menu trigger", async () => {
  mocks.rename.mockResolvedValue({ ok: true });
  await mount(<ScenarioActionsMenu id="scenario" currentName="Name" labels={he.savedPage} />);
  const opener = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
  await click(opener);
  await click(button(he.savedPage.renameAction));
  expect(document.activeElement?.id).toBe("rename-scenario-scenario");
  await submit();
  expect(mocks.rename).toHaveBeenCalledWith({ id: "scenario", name: "Name" });
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(opener);
});

it("keeps failed rename input editable and permits a successful retry", async () => {
  mocks.rename.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ ok: true });
  await mount(<ScenarioActionsMenu id="scenario" currentName="Name" labels={he.savedPage} />);
  await click(document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!);
  await click(button(he.savedPage.renameAction));
  await submit();
  expect(document.body.textContent).toContain(he.savedPage.actionErrorMessage);
  expect(document.querySelector<HTMLInputElement>("dialog input")!.disabled).toBe(false);
  expect(mocks.refresh).not.toHaveBeenCalled();
  await submit();
  expect(mocks.rename).toHaveBeenCalledTimes(2);
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(document.querySelector("dialog")).toBeNull();
});

it("prevents duplicate copy saves and keeps the edit dialog usable after failure", async () => {
  let reject!: (error: Error) => void;
  mocks.create.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  await mount(<EditScenarioSaveButton locale="he" buttonLabel="Save edits" drafts={drafts} editContext={editContext} onUpdated={() => {}} labels={he.editScenarioDialog} saveScenarioLabels={he.saveScenarioDialog} />);
  await click(button("Save edits"));
  await click(button(he.editScenarioDialog.saveAsNewButton));
  await submit();
  await submit();
  await cancelDialog();
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(document.querySelector("dialog")).not.toBeNull();
  await act(async () => { reject(new Error("network")); });
  expect(document.body.textContent).toContain(he.editScenarioDialog.genericErrorMessage);
  expect(document.activeElement?.id).toBe("edit-scenario-name");
  expect(button(he.editScenarioDialog.saveAsNewButton).disabled).toBe(false);
});
