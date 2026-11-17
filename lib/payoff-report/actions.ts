"use server";

import { createClient } from "../supabase/server";
import { readSavedLoans } from "./saved";

/**
 * Save and delete the signed-in user's current mortgage (the loans
 * confirmed on /my-mortgage). The caller's own session is used, never a
 * service key; RLS's owner-only policies are the real boundary, with the
 * user_id filters as defense in depth. Errors come back as a small code,
 * never as a raw database message.
 */

export type MyMortgageError = "unauthenticated" | "invalid" | "failed";

export async function saveMyMortgage(
  loans: unknown,
): Promise<{ ok: true; updatedAt: string } | { ok: false; error: MyMortgageError }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const valid = readSavedLoans(loans);
  if (valid === null || valid.length > 20) return { ok: false, error: "invalid" };
  const asOfDate = valid.map((loan) => loan.asOfDate).filter((date) => date !== null).sort().at(-1) ?? null;

  const { data, error } = await supabase
    .from("existing_mortgages")
    .upsert({ user_id: user.id, schema_version: 1, loans: valid, as_of_date: asOfDate }, { onConflict: "user_id" })
    .select("updated_at")
    .single();
  if (error || !data) {
    console.error("[my-mortgage] save failed:", { code: error?.code, message: error?.message });
    return { ok: false, error: "failed" };
  }
  return { ok: true, updatedAt: data.updated_at };
}

export async function deleteMyMortgage(): Promise<{ ok: true } | { ok: false; error: MyMortgageError }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const { error } = await supabase.from("existing_mortgages").delete().eq("user_id", user.id);
  if (error) {
    console.error("[my-mortgage] delete failed:", { code: error.code, message: error.message });
    return { ok: false, error: "failed" };
  }
  return { ok: true };
}
