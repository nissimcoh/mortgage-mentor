import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import { proxy } from "../../../proxy";

type Cookie = { name: string; value: string; options: CookieOptions };
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  cookies: null as null | { getAll: () => {name: string; value: string}[]; setAll: (cookies: Cookie[], headers: Record<string, string>) => void },
}));
vi.mock("../env", () => ({ SUPABASE_URL: "https://test.invalid", SUPABASE_PUBLISHABLE_KEY: "test-only" }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: NonNullable<typeof mocks.cookies> }) => {
    mocks.cookies = options.cookies;
    return { auth: { getUser: mocks.getUser } };
  },
}));
beforeEach(() => { mocks.getUser.mockReset(); mocks.cookies = null; });
const headers = { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0", Expires: "0", Pragma: "no-cache" };

it.each(["/he/calculator", "/en/saved", "/calculator?track1Amount=500000"])("returns refreshed/chunked cookies and private response headers for %s", async path => {
  const request = new NextRequest(`https://mortgage.test${path}`, { headers: { Cookie: "sb-test-auth-token.0=old; sb-test-auth-token.1=obsolete" } });
  mocks.getUser.mockImplementation(async () => {
    expect(mocks.cookies!.getAll().find(c => c.name === "sb-test-auth-token.0")?.value).toBe("old");
    mocks.cookies!.setAll([
      {name:"sb-test-auth-token.0",value:"refreshed-test-cookie",options:{path:"/",sameSite:"lax",secure:true,maxAge:3600}},
      {name:"sb-test-auth-token.1",value:"",options:{path:"/",maxAge:0}},
    ], headers);
    return {data:{user:{id:"test-only"}},error:null};
  });
  const response = await proxy(request);
  expect(mocks.getUser).toHaveBeenCalledOnce();
  expect(request.cookies.get("sb-test-auth-token.0")?.value).toBe("refreshed-test-cookie");
  expect(response.cookies.get("sb-test-auth-token.0")).toMatchObject({value:"refreshed-test-cookie",path:"/",sameSite:"lax",secure:true,maxAge:3600});
  expect(response.cookies.get("sb-test-auth-token.1")).toMatchObject({value:"",maxAge:0});
  for (const [name, value] of Object.entries(headers)) expect(response.headers.get(name)).toBe(value);
  if (path.startsWith("/calculator")) {
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://mortgage.test/he/calculator?track1Amount=500000");
  } else {
    expect(response.status).toBe(200);
    // The forwarded request also receives the fresh session on this render.
    expect(response.headers.get("x-middleware-request-cookie")).toContain("refreshed-test-cookie");
  }
});

it("does not issue cookies or add private-refresh headers to an unchanged anonymous request", async () => {
  mocks.getUser.mockResolvedValue({data:{user:null},error:null});
  const response = await proxy(new NextRequest("https://mortgage.test/he/learn"));
  expect(response.cookies.getAll()).toEqual([]);
  expect(response.headers.has("cache-control")).toBe(false);
});
