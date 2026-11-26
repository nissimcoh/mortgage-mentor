import { beforeEach, expect, it, vi } from "vitest";
import { deleteMyMortgage, saveMyMortgage } from "../actions";
import { needsReportDate, prepareForConfirm } from "../confirm";
import { parsePayoffReportFile } from "../parse";
import { readSavedLoans } from "../saved";
import { fictionalTwoLoanFile } from "./fixtures";

const db = vi.hoisted(() => ({
  from: vi.fn(), insert: vi.fn(), delete: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock("../../supabase/server", () => ({
  createClient: async () => ({ from: db.from, auth: { getUser: async () => ({ data: { user: { id: "test-user" } } }) } }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  for (const method of [db.from, db.insert, db.delete, db.update, db.eq, db.select]) method.mockReturnValue(db);
  db.maybeSingle.mockResolvedValue({ data: { updated_at: "new-version" }, error: null });
});

it.each([null, "2026-02-30"])("rejects an active loan with report date %s before writing", async (asOfDate) => {
  const loans = fictionalTwoLoanFile().loans.map((loan, i) => i === 1 ? { ...loan, asOfDate } : loan);
  expect(await saveMyMortgage(loans)).toEqual({ ok: false, error: "invalid" });
  expect(db.from).not.toHaveBeenCalled();
});

it("rejects a nonpositive reset interval before writing", async () => {
  const loans = fictionalTwoLoanFile().loans;
  loans[0].tracks[1].variable!.resetFrequencyMonths = 0;
  expect(await saveMyMortgage(loans)).toEqual({ ok: false, error: "invalid" });
  expect(db.from).not.toHaveBeenCalled();
});

it("allows an undated loan containing only closed tracks", async () => {
  const loan = fictionalTwoLoanFile().loans[0];
  const loans = [{ ...loan, asOfDate: null, tracks: loan.tracks.filter((track) => track.status === "closed") }];
  expect(await saveMyMortgage(loans)).toEqual({ ok: true, updatedAt: "new-version" });
  expect(db.insert).toHaveBeenCalledOnce();
});

it("repairs the existing version and preserves the user's selected anchor on subsequent reads", async () => {
  const parsed = parsePayoffReportFile(fictionalTwoLoanFile(), "report.pdf");
  if (!parsed.ok) throw Error("fixture must parse");
  const loans = prepareForConfirm(parsed.file).loans;
  loans[0].tracks[1].variable!.anchorSeries = "other";
  const legacy = readSavedLoans(loans.map((loan) => ({ ...loan, asOfDate: null })))!;
  expect(legacy.every(needsReportDate)).toBe(true);
  expect(await saveMyMortgage(loans, "original-version")).toEqual({ ok: true, updatedAt: "new-version" });
  expect(db.eq.mock.calls).toEqual([["user_id", "test-user"], ["updated_at", "original-version"]]);
  expect(readSavedLoans(db.update.mock.calls[0][0].loans)).toEqual(loans);
  db.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await saveMyMortgage(loans, "original-version")).toEqual({ ok: false, error: "changed" });
  expect(db.insert).not.toHaveBeenCalled();
});

it("preserves a mortgage created or updated by another tab", async () => {
  db.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
  expect(await saveMyMortgage(fictionalTwoLoanFile().loans)).toEqual({ ok: false, error: "changed" });
  expect(db.update).not.toHaveBeenCalled();
  db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
  expect(await deleteMyMortgage("previous-version")).toEqual({ ok: false, error: "changed" });
  expect(db.eq.mock.calls).toEqual([["user_id", "test-user"], ["updated_at", "previous-version"]]);
});
