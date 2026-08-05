import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { defaultLocale, isValidLocale } from "@/lib/i18n/config";
import { sanitizeNextPath } from "@/lib/auth/redirect-target";
import { createClient } from "@/lib/supabase/server";

/**
 * Exchanges an auth confirmation for a session, then redirects to the
 * sanitized `next` path. Placed inside the [locale] segment on purpose —
 * anywhere outside it gets caught by proxy.ts's own locale redirect before
 * this handler would ever run.
 *
 * Handles both shapes Supabase can send here:
 *  - `code` — the PKCE authorization-code shape; this is what Google OAuth
 *    (the active sign-in method) produces, verified with
 *    exchangeCodeForSession.
 *  - `token_hash` + `type` — the email-OTP/magic-link confirmation shape;
 *    verified with verifyOtp. Not currently reachable (no email-based sign-in
 *    is wired up), kept so this route doesn't need to change if one is added.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: rawLocale } = await params;
  const locale = isValidLocale(rawLocale) ? rawLocale : defaultLocale;

  const { searchParams } = request.nextUrl;
  const next = sanitizeNextPath(searchParams.get("next"), `/${locale}/saved`);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();

  let verified = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    verified = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  }

  const redirectUrl = new URL(
    verified ? next : `/${locale}/signin`,
    request.url,
  );
  if (!verified) {
    redirectUrl.searchParams.set("error", "auth");
  }
  return NextResponse.redirect(redirectUrl);
}
