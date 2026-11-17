import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), extract: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
vi.mock("@/lib/payoff-report/extract", () => ({ extractPayoffReport: mocks.extract }));

import { POST } from "../route";

const pdf = new TextEncoder().encode("%PDF-1.7 fictional");

function upload(bytes: Uint8Array<ArrayBuffer> = pdf) {
  const form = new FormData();
  form.set("file", new File([bytes], "report.pdf", { type: "application/pdf" }));
  return new Request("http://localhost/api/payoff-report", { method: "POST", body: form });
}

async function call(request = upload()) {
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
  mocks.rpc.mockResolvedValue({ data: "ok", error: null });
  mocks.extract.mockResolvedValue({
    ok: true,
    file: { fileName: "report.pdf", loans: [] },
    issues: [],
    model: "m",
    usage: { inputTokens: 1, outputTokens: 1, totalPages: 1, pagesSent: 1 },
  });
});

describe("POST /api/payoff-report", () => {
  it("claims a read with the configured limits before calling the model", async () => {
    vi.stubEnv("PAYOFF_REPORT_DAILY_LIMIT", "3");
    expect((await call()).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("claim_payoff_report_read", { user_limit: 3, site_limit: 100 });
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.extract.mock.invocationCallOrder[0]);
  });

  it.each([
    ["user-limit", 429, "quota"],
    ["site-limit", 429, "site-quota"],
    ["unauthenticated", 401, "unauthenticated"],
  ])("never calls the model when the claim says %s", async (claim, status, error) => {
    mocks.rpc.mockResolvedValue({ data: claim, error: null });
    expect(await call()).toEqual({ status, body: { ok: false, error } });
    expect(mocks.extract).not.toHaveBeenCalled();
  });

  it("blocks reading when the limit can't be checked", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "function not found" } });
    expect(await call()).toEqual({ status: 503, body: { ok: false, error: "unavailable" } });
    mocks.rpc.mockResolvedValue({ data: "something else", error: null });
    expect((await call()).status).toBe(503);
    expect(mocks.extract).not.toHaveBeenCalled();
  });

  it("spends no read on a request that fails earlier", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
    expect((await call(upload(new TextEncoder().encode("<html>")))).status).toBe(415);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await call()).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
