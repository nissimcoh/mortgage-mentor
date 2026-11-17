import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PAYOFF_REPORT_MODEL,
  PAYOFF_REPORT_JSON_SCHEMA,
  buildPayoffExtractionRequest,
  extractPayoffReport,
} from "../extract";
import { parsePayoffReportFile } from "../parse";
import { fictionalTwoLoanFile } from "./fixtures";

const PDF = new TextEncoder().encode("%PDF-1.7 fictional");

/** The fixture as the model returns it: every leaf a string, "" for missing. */
function asModelOutput(value: unknown): unknown {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(asModelOutput);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, field]) => [
        key,
        key === "variable" && field === null
          ? {
              marginPercent: "",
              anchorText: "",
              resetFrequencyMonths: "",
              nextResetDate: "",
              originalRatePercent: "",
            }
          : asModelOutput(field),
      ]),
    );
  }
  return value;
}

function apiResponse(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

function answer(text: string, stopReason = "end_turn") {
  return apiResponse({
    stop_reason: stopReason,
    content: [{ type: "text", text }],
    usage: { input_tokens: 34000, output_tokens: 500 },
  });
}

function run(fetchImpl: typeof fetch) {
  return extractPayoffReport({ pdf: PDF, fileName: "report.pdf", apiKey: "test-key", fetchImpl });
}

type SchemaNode = { properties?: Record<string, SchemaNode>; items?: SchemaNode };

function schemaKeys(node: SchemaNode | undefined): string[] {
  return Object.keys(node?.properties ?? {}).sort();
}

describe("payoff report schema", () => {
  const loan = (PAYOFF_REPORT_JSON_SCHEMA as SchemaNode).properties!.loans.items!;
  const track = loan.properties!.tracks.items!;
  const fixtureLoan = fictionalTwoLoanFile().loans[0];
  const fixtureTrack = fixtureLoan.tracks[1];

  it("asks for exactly the fields the parser reads", () => {
    expect(schemaKeys(loan)).toEqual(Object.keys(fixtureLoan).sort());
    expect(schemaKeys(track)).toEqual(Object.keys(fixtureTrack).sort());
    for (const key of ["fees", "balance", "variable"] as const) {
      expect(schemaKeys(track.properties![key])).toEqual(Object.keys(fixtureTrack[key]!).sort());
    }
  });

  it("has no union types, which the API caps at 16 per schema", () => {
    const json = JSON.stringify(PAYOFF_REPORT_JSON_SCHEMA);
    expect(json).not.toContain("anyOf");
    expect(json).not.toMatch(/"type":\[/);
  });
});

describe("buildPayoffExtractionRequest", () => {
  it("sends the PDF as a document with the schema, and no key", () => {
    const body = buildPayoffExtractionRequest(PDF, DEFAULT_PAYOFF_REPORT_MODEL);
    const [document] = body.messages[0].content;
    expect(document).toEqual({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Buffer.from(PDF).toString("base64"),
      },
    });
    expect(body.output_config.format.schema).toBe(PAYOFF_REPORT_JSON_SCHEMA);
    expect(JSON.stringify(body)).not.toContain("test-key");
  });
});

describe("extractPayoffReport", () => {
  it("returns the parsed file, identical to parsing the same figures directly", async () => {
    const fetchImpl = answer(JSON.stringify(asModelOutput(fictionalTwoLoanFile())));
    const result = await run(fetchImpl);
    const direct = parsePayoffReportFile(fictionalTwoLoanFile(), "report.pdf");
    expect(result.ok && direct.ok).toBe(true);
    if (!result.ok || !direct.ok) return;
    expect(result.file).toEqual(direct.file);
    expect(result.issues).toEqual([]);
    expect(result.model).toBe(DEFAULT_PAYOFF_REPORT_MODEL);
    expect(result.usage).toEqual({ inputTokens: 34000, outputTokens: 500 });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
  });

  it("uses the requested model", async () => {
    const fetchImpl = answer(JSON.stringify(asModelOutput(fictionalTwoLoanFile())));
    await extractPayoffReport({
      pdf: PDF,
      fileName: "report.pdf",
      apiKey: "test-key",
      model: "some-other-model",
      fetchImpl,
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).model).toBe("some-other-model");
  });

  it.each([
    [429, "busy"],
    [529, "busy"],
    [400, "api-error"],
    [500, "api-error"],
  ])("maps HTTP %i to %s", async (status, error) => {
    expect(await run(apiResponse({ type: "error" }, status))).toEqual({
      ok: false,
      error,
      status,
    });
  });

  it("reports network failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await run(fetchImpl)).toEqual({ ok: false, error: "api-error" });
  });

  it("reports cut-off and refused answers", async () => {
    expect(await run(answer('{"loans": [', "max_tokens"))).toEqual({
      ok: false,
      error: "truncated",
    });
    expect(await run(answer("", "refusal"))).toEqual({ ok: false, error: "refused" });
  });

  it("reports answers with nothing usable", async () => {
    expect(await run(answer("not json"))).toEqual({ ok: false, error: "unreadable" });
    expect(await run(answer('{"loans": []}'))).toEqual({ ok: false, error: "unreadable" });
  });
});
