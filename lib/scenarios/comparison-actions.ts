"use server";

import { createClient } from "../supabase/server";
import { COMPARISON_COLUMNS, loadComparisonScenarios } from "./load-comparison";
import { isUuidLike } from "./payload";

/**
 * Payment series for mixes picked on the comparison page after it loaded.
 * Same boundary as the page: the caller's own session, an explicit user_id
 * filter on top of RLS, and at most the three mixes one comparison shows.
 * Unknown, foreign or unverifiable IDs come back as null ("unavailable").
 */
export async function loadComparisonPayments(ids: unknown): Promise<Record<string, number[] | null> | null> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 3 || !ids.every(isUuidLike)) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows, error } = await supabase.from("mortgage_scenarios")
    .select(COMPARISON_COLUMNS)
    .eq("user_id", user.id)
    .in("id", ids);
  if (error) return null;
  const scenarios = await loadComparisonScenarios(rows ?? [], ids);
  return Object.fromEntries(ids.map(id => [id, scenarios.find(item => item.id === id)?.payments ?? null]));
}
