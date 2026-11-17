import "server-only";

import { createClient } from "../supabase/server";
import { readSavedLoans, type SavedMyMortgage } from "./saved";

/**
 * For server components only (deliberately not a server action, so it can't
 * be called from the browser with someone else's id): the signed-in user's
 * saved mortgage, or null. RLS limits the read to the caller's own row.
 */
export async function loadMyMortgage(userId: string): Promise<SavedMyMortgage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("existing_mortgages")
    .select("loans, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // Before the migration is applied the table is missing; the page still works.
    console.error("[my-mortgage] load failed:", { code: error.code, message: error.message });
    return null;
  }
  if (!data) return null;
  const loans = readSavedLoans(data.loans);
  return loans ? { loans, updatedAt: data.updated_at } : null;
}
