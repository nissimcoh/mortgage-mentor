/**
 * Daily limits on reading reports with the model (paid per call). Enforced
 * in Postgres by claim_payoff_report_read(); these are the values the route
 * asks for. Override with PAYOFF_REPORT_DAILY_LIMIT (per user) and
 * PAYOFF_REPORT_SITE_DAILY_LIMIT (all users); the database caps them at 50
 * and 1000 whatever is configured.
 */

export const DEFAULT_USER_DAILY_LIMIT = 10;
export const DEFAULT_SITE_DAILY_LIMIT = 100;

export type QuotaClaim = "ok" | "user-limit" | "site-limit" | "unauthenticated";

function readLimit(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function readQuotaLimits(env: Record<string, string | undefined>): { user: number; site: number } {
  return {
    user: readLimit(env.PAYOFF_REPORT_DAILY_LIMIT, DEFAULT_USER_DAILY_LIMIT),
    site: readLimit(env.PAYOFF_REPORT_SITE_DAILY_LIMIT, DEFAULT_SITE_DAILY_LIMIT),
  };
}

export function isQuotaClaim(value: unknown): value is QuotaClaim {
  return value === "ok" || value === "user-limit" || value === "site-limit" || value === "unauthenticated";
}
