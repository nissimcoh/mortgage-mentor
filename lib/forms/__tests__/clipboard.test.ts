import { describe, expect, it } from "vitest";
import { copyScenarioLink } from "../clipboard";

describe("copyScenarioLink", () => {
  it("resolves to success when the copy implementation succeeds", async () => {
    const result = await copyScenarioLink(async () => {}, "https://example.com/x");
    expect(result).toBe("success");
  });

  it("resolves to fallback when the copy implementation rejects", async () => {
    const result = await copyScenarioLink(async () => {
      throw new Error("clipboard unavailable");
    }, "https://example.com/x");
    expect(result).toBe("fallback");
  });

  it("resolves to fallback when the copy implementation throws synchronously", async () => {
    const result = await copyScenarioLink(() => {
      throw new Error("no navigator.clipboard");
    }, "https://example.com/x");
    expect(result).toBe("fallback");
  });

  it("passes the exact URL through to the copy implementation", async () => {
    let received: string | null = null;
    await copyScenarioLink(async (text) => {
      received = text;
    }, "https://example.com/he/calculator?trackCount=1");
    expect(received).toBe("https://example.com/he/calculator?trackCount=1");
  });
});
