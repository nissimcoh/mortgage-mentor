import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { defaultLocale, locales } from "@/lib/i18n/config";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Refresh the Supabase session cookie first. getUser() (never
  // getSession(), which trusts a possibly-stale cookie) revalidates
  // against the auth server and triggers the setAll callback in
  // updateSession when the token needs refreshing.
  const { getResponse, supabase } = updateSession(request);
  await supabase.auth.getUser();
  // Read only after getUser(): a refresh swaps in a new response object.
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
