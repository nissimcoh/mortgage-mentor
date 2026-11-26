"use server";

import { createClient } from "../supabase/server";
import { readSavedLoans } from "./saved";
import { invalidResetPeriod, needsReportDate } from "./confirm";

/**
 * Save and delete the signed-in user's current mortgage (the loans
 * confirmed on /my-mortgage). The caller's own session is used, never a
 * service key; RLS's owner-only policies are the real boundary, with the
 * user_id filters as defense in depth. Errors come back as a small code,
 * never as a raw database message.
 */

export type MyMortgageError = "unauthenticated" | "invalid" | "failed" | "changed";

export async function saveMyMortgage(
  loans: unknown,
  expectedUpdatedAt?: string,
): Promise<{ ok: true; updatedAt: string } | { ok: false; error: MyMortgageError }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const valid = readSavedLoans(loans);
  if (valid === null || valid.length > 20 || valid.some((loan) => needsReportDate(loan) || loan.tracks.some(invalidResetPeriod))) return { ok: false, error: "invalid" };
  const asOfDate = valid.map((loan) => loan.asOfDate).filter((date) => date !== null).sort().at(-1) ?? null;

  const row = { schema_version: 1, loans: valid, as_of_date: asOfDate };
  const mortgages = supabase.from("existing_mortgages");
  const write = expectedUpdatedAt === undefined
    ? mortgages.insert({ ...row, user_id: user.id })
    : mortgages.update(row).eq("user_id", user.id).eq("updated_at", expectedUpdatedAt);
  const { data, error } = await write
    .select("updated_at")
    .maybeSingle();
  if (error?.code === "23505" && expectedUpdatedAt === undefined) return { ok: false, error: "changed" };
  if (!error && !data && expectedUpdatedAt !== undefined) return { ok: false, error: "changed" };
  if (error || !data) {
    console.error("[my-mortgage] save failed:", { code: error?.code, message: error?.message });
    return { ok: false, error: "failed" };
  }
  return { ok: true, updatedAt: data.updated_at };
}

export async function deleteMyMortgage(expectedUpdatedAt: string): Promise<{ ok: true } | { ok: false; error: MyMortgageError }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const { error, data } = await supabase.from("existing_mortgages").delete()
    .eq("user_id", user.id).eq("updated_at", expectedUpdatedAt).select("user_id").maybeSingle();
  if (error) {
    console.error("[my-mortgage] delete failed:", { code: error.code, message: error.message });
    return { ok: false, error: "failed" };
  }
  if (!data) return { ok: false, error: "changed" };
  return { ok: true };
}
