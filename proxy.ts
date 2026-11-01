import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { defaultLocale, locales } from "@/lib/i18n/config";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Refresh the Supabase session cookie first. getClaims() (never
  // getSession(), which trusts a possibly-stale cookie) refreshes an
  // expiring token, triggering the setAll callback in updateSession, and
  // verifies the JWT signature locally against the cached JWKS. That keeps
  // the auth server off this per-request path, prefetches included; for a
  // symmetric (legacy-secret) token it falls back to getUser() itself.
  // Pages and actions still call getUser() before reading or writing data.
  const { getResponse, supabase } = updateSession(request);
  await supabase.auth.getClaims();
  // Read only after getClaims(): a refresh swaps in a new response object.
  const response = getResponse();

  const { pathname } = request.nextUrl;

  const pathnameHasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (pathnameHasLocale) return response;

  request.nextUrl.pathname = `/${defaultLocale}${pathname}`;
  const redirect = NextResponse.redirect(request.nextUrl);
  // Carry over any refreshed session cookie so the refresh above isn't
  // silently discarded on every locale-fixing redirect.
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  for (const name of ["cache-control", "expires", "pragma"]) {
    const value = response.headers.get(name);
    if (value !== null) redirect.headers.set(name, value);
  }
  return redirect;
}

export const config = {
  // Skip Next.js internals, API routes, and any path with a file extension
  // (static assets, favicon, images, fonts, etc.)
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
