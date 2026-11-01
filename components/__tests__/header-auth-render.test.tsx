// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import HeaderAuthStatus from "../HeaderAuthStatus";
import he from "@/app/[locale]/dictionaries/he.json";
import { mount, unmount } from "./dom-helpers";

// The browser client is imported on demand; these mocks apply to that import.
const mocks = vi.hoisted(() => ({ session: null as unknown, unsubscribe: vi.fn(), rpc: vi.fn() }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/he" }));
vi.mock("@/lib/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: mocks.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: mocks.unsubscribe } } }),
    },
    rpc: mocks.rpc,
  }),
}));

const render = () => mount(<HeaderAuthStatus locale="he" signInLabel="Sign in" labels={he.accountMenu} />);
// Waits for the on-demand SDK import and the session read to settle. Each
// poll is its own act() so React commits the resulting state in between.
async function settleUntil(check: () => void) {
  for (let attempt = 0; attempt < 50; attempt++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    try { check(); return; } catch { /* not settled yet */ }
  }
  check();
}

beforeEach(() => {
  mocks.session = null;
  mocks.unsubscribe.mockReset();
  mocks.rpc.mockReset().mockResolvedValue({ data: false, error: null });
});
afterEach(unmount);

it("shows the sign-in link once the lazily loaded client reports no session", async () => {
  await render();
  await settleUntil(() => expect(document.querySelector("a[href='/he/signin']")?.textContent).toBe("Sign in"));
});

it("shows the account menu for a stored session and checks admin access", async () => {
  mocks.session = { user: { id: "test-only", email: "user@example.com", user_metadata: { full_name: "Test User" } } };
  await render();
  await settleUntil(() => expect(mocks.rpc).toHaveBeenCalledWith("is_current_user_admin"));
  expect(document.querySelector("button[aria-haspopup='menu']")).not.toBeNull();
});

it("unsubscribes from auth events on unmount", async () => {
  await render();
  await settleUntil(() => expect(document.querySelector("a[href='/he/signin']")).not.toBeNull());
  await unmount();
  expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
});
