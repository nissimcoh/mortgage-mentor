export interface AdminUserMetadata {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface ScenarioActivityMetadata {
  user_id: string;
  updated_at: string;
}

export interface AdminUsageMetadata extends AdminUserMetadata {
  saved_count: number;
  last_save_at: string | null;
}

export type ActivityStatus = "recent" | "older" | "quiet" | "unknown";

export interface AdminUserOverview {
  id: string;
  email: string | null;
  joinedAt: string;
  lastSignInAt: string | null;
  lastSaveAt: string | null;
  lastRecordedActivityAt: string | null;
  savedCount: number;
  daysSinceActivity: number | null;
  status: ActivityStatus;
  reviewSuggested: boolean;
  isCurrentUser: boolean;
}

const DAY = 86_400_000;
const timestamp = (value: string | null): number | null => {
  if (!value) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
};

/** Metadata only: never accept names, amounts, rates or saved result payloads.
 * Activity is observed sign-in/save activity, not a visit or presence tracker.
 */
export function buildUserOverview(
  users: AdminUserMetadata[],
  scenarios: ScenarioActivityMetadata[],
  now: number,
  currentUserId: string,
): AdminUserOverview[] {
  const activity = new Map<string, { count: number; lastSave: string | null }>();
  for (const scenario of scenarios) {
    const previous = activity.get(scenario.user_id) ?? { count: 0, lastSave: null };
    previous.count += 1;
    if ((timestamp(scenario.updated_at) ?? -Infinity) > (timestamp(previous.lastSave) ?? -Infinity)) {
      previous.lastSave = scenario.updated_at;
    }
    activity.set(scenario.user_id, previous);
  }
  return buildUserOverviewFromAggregates(users.map(user => ({
    ...user,
    saved_count: activity.get(user.id)?.count ?? 0,
    last_save_at: activity.get(user.id)?.lastSave ?? null,
  })), now, currentUserId);
}

export function buildUserOverviewFromAggregates(
  users: AdminUsageMetadata[], now: number, currentUserId: string,
): AdminUserOverview[] {
  return users.map((user) => {
    const lastSaveAt = user.last_save_at;
    const signIn = timestamp(user.last_sign_in_at);
    const save = timestamp(lastSaveAt);
    const latest = Math.max(signIn ?? -Infinity, save ?? -Infinity);
    const lastRecordedActivityAt = Number.isFinite(latest)
      ? new Date(latest).toISOString() : null;
    const age = Number.isFinite(latest) ? Math.max(0, now - latest) : null;
    const daysSinceActivity = age === null ? null : Math.floor(age / DAY);
    const status: ActivityStatus = age === null ? "unknown"
      : age <= 30 * DAY ? "recent" : age <= 90 * DAY ? "older" : "quiet";
    const savedCount = user.saved_count;
    const joined = timestamp(user.created_at);
    // A new account never qualifies merely because no sign-in is recorded.
    // Review is a prompt to investigate, not permission or proof for deletion.
    const reviewSuggested = user.id !== currentUserId && savedCount === 0 &&
      joined !== null && now - joined >= 180 * DAY &&
      (age === null || age >= 180 * DAY);
    return {
      id: user.id, email: user.email, joinedAt: user.created_at,
      lastSignInAt: signIn === null ? null : user.last_sign_in_at,
      lastSaveAt, lastRecordedActivityAt, savedCount, daysSinceActivity,
      status, reviewSuggested, isCurrentUser: user.id === currentUserId,
    };
  });
}
