/**
 * Validates a user-supplied post-auth "next" redirect target. Pure
 * TypeScript, no framework imports — used by both the sign-in page (to
 * embed `next` into the magic-link's emailRedirectTo) and the auth
 * callback route (to redirect there after a successful verification).
 */

import { locales } from "../i18n/config";

const LOCALE_PATH_PATTERN = new RegExp(`^/(${locales.join("|")})(/.*)?$`);

/**
 * Only a same-origin, locale-prefixed, in-app path is ever accepted.
 * Rejects protocol-relative paths ("//host/..."), absolute URLs
 * ("https://...", "javascript:..."), and anything missing a recognized
 * locale prefix — falls back to `fallback` for everything else, so a
 * malicious "next" value can never send someone off-site after signing in.
 */
export function sanitizeNextPath(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (!LOCALE_PATH_PATTERN.test(raw)) return fallback;
  return raw;
}
