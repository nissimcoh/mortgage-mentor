import { trimPayoffPdf } from "./pages";
import { parsePayoffReportFile, type PayoffParseIssue } from "./parse";
import type { PayoffReportFile } from "./types";

/**
 * Reads one payoff-report PDF with a Claude model and returns the figures as
 * a validated `PayoffReportFile`. The model only copies what is printed; all
 * arithmetic and every judgement about the numbers happen afterwards, in
 * deterministic code (checks.ts) and with the user on the confirm screen.
 *
 * Server-only: the API key must never reach the browser. Nothing is stored;
 * the PDF goes to the API in the request body and is dropped afterwards.
 */

export const DEFAULT_PAYOFF_REPORT_MODEL = "claude-sonnet-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_OUTPUT_TOKENS = 8000;

// Every figure is a string, with "" for "not printed". The API caps how many
// schema fields may be unions (nullable), and a report has far more than
// that; parse.ts turns "" into null and numeric strings into numbers.
const nullableNumber = {
  type: "string",
  description: 'Number as plain digits, e.g. "1951.19", or "" if not printed',
} as const;
const nullableText = { type: "string", description: 'Text as printed, or "" if not printed' } as const;
const nullableDate = { type: "string", description: 'YYYY-MM-DD, or "" if not printed' } as const;

function object(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  } as const;
}

const feesSchema = object({
  capitalization: nullableNumber,
  capitalizationRatePercent: nullableNumber,
  capitalizationReductionPercent: nullableNumber,
  capitalizationReductionAmount: nullableNumber,
  notice: nullableNumber,
  averageCpi: nullableNumber,
  operational: nullableNumber,
  total: nullableNumber,
});

const balanceSchema = object({
  principal: nullableNumber,
  indexation: nullableNumber,
  accruedInterest: nullableNumber,
  futureMonthlyCharge: nullableNumber,
  arrears: nullableNumber,
  otherCharges: nullableNumber,
  totalToSettle: nullableNumber,
});

const variableSchema = object({
  marginPercent: nullableNumber,
  anchorText: nullableText,
  resetFrequencyMonths: nullableNumber,
  nextResetDate: nullableDate,
  originalRatePercent: nullableNumber,
});

const trackSchema = object({
  label: nullableText,
  status: { type: "string", enum: ["active", "closed"] },
  loanTypeText: nullableText,
  originalAmount: nullableNumber,
  startDate: nullableDate,
  firstPaymentDate: nullableDate,
  endDate: nullableDate,
  monthlyPayment: nullableNumber,
  annualRatePercent: nullableNumber,
  repaymentMethod: { type: "string", enum: ["spitzer", "equalPrincipal", "balloon", "unknown"] },
  linkage: { type: "string", enum: ["unlinked", "cpi", "foreignCurrency", "unknown"] },
  cpiBaseIndex: nullableNumber,
  rateType: { type: "string", enum: ["fixed", "variable", "prime", "unknown"] },
  /** All fields "" for tracks without a reset schedule. */
  variable: variableSchema,
  fees: feesSchema,
  balance: balanceSchema,
});

const loanSchema = object({
  bankName: nullableText,
  loanNumber: nullableText,
  asOfDate: nullableDate,
  tracks: { type: "array", items: trackSchema },
  loanLevelFees: nullableNumber,
  reportedTotals: object({
    monthlyPayment: nullableNumber,
    fees: nullableNumber,
    totalToSettle: nullableNumber,
  }),
});

/** JSON Schema the model's answer is constrained to; mirrors types.ts. */
export const PAYOFF_REPORT_JSON_SCHEMA = object({
  loans: { type: "array", items: loanSchema },
});

export const PAYOFF_REPORT_INSTRUCTIONS = `You read Israeli mortgage early-repayment balance reports (דוח יתרות לסילוק, פירוט יתרות ועמלות פירעון מוקדם) and copy their figures into JSON.

Rules:
- Copy, never compute. Every value is a string; if a value is not printed, use "". Never fill a total by adding parts, or a part by subtracting.
- One entry in "loans" per loan number. A file may contain several loans. A loan has one or more tracks (משנה, sub-loans), often printed as columns.
- Include every track printed, including tracks already repaid or refinanced (monthly payment 0, end date before the report date, no balance). Mark those "closed", all others "active".
- Dates as YYYY-MM-DD. Israeli reports print DD/MM/YYYY.
- Percentages as plain numbers (4.44 for 4.44%). Money in shekels as plain numbers without thousands separators.
- annualRatePercent is the current nominal annual rate (e.g. ריבית שנתית להלוואה), not the adjusted/effective rate (ריבית מתואמת), the forecast total rate or the comparison rate.
- variable: fill only for tracks whose rate resets periodically; otherwise leave all its fields "". marginPercent is the number added to the anchor ("עוגן+0.65%" gives 0.65; a subtraction gives a negative number). anchorText is the anchor's name exactly as printed. originalRatePercent is the nominal rate at issue; leave it "" if only an adjusted rate (מתואמת) is printed.
- fees.capitalization is the capitalization fee (עמלת היוון) as printed, after any reduction. capitalizationRatePercent is the discount rate printed with it (ריבית להיוון).
- loanLevelFees: fees printed only in the loan's total column and not under any track (for example a single operational fee per loan). Do not also put them on a track.
- reportedTotals come from the loan's total column or row (סה"כ להלוואה).
- balance.totalToSettle is the track's total to settle, including its fees, as printed. Linkage differentials on interest (הפרשי הצמדה על הריבית) go in balance.otherCharges.
- linkage: "cpi" for צמוד מדד, "unlinked" for לא צמוד or שקלי (prime too), "foreignCurrency" for מט"ח. If the report has a linkage field (e.g. בסיס הצמדה, סוג הצמדה) and it is empty for a track, that track is not linked: use "unlinked". Use "unknown" only when the report has no linkage field at all.
- rateType: "fixed" for קבועה, "variable" for משתנה with a reset schedule, "prime" for פריים.
- repaymentMethod: "spitzer" for שפיצר, "equalPrincipal" for קרן שווה, "balloon" for בלון.
- Ignore explanatory pages, blank forms and worked examples; they hold no loan figures.
- Never output borrower names, ID numbers, addresses or phone numbers. The schema has no place for them.`;

export interface PayoffExtractionInput {
  pdf: Uint8Array;
  fileName: string;
  apiKey: string;
  model?: string;
  /** Drop boilerplate pages first (default). Off only for tests and comparisons. */
  trimPages?: boolean;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export type PayoffExtractionError =
  /** Network failure or an unexpected API response. */
  | "api-error"
  /** The API is rate limiting or overloaded; worth retrying later. */
  | "busy"
  /** The answer was cut off before it was complete. */
  | "truncated"
  /** The model declined to read the document. */
  | "refused"
  /** The answer was not usable JSON, or held no usable loan. */
  | "unreadable";

export interface PayoffExtractionUsage {
  inputTokens: number;
  outputTokens: number;
  /** Pages in the uploaded file, and pages actually sent to the model. */
  totalPages: number | null;
  pagesSent: number | null;
}

export type PayoffExtractionResult =
  | {
      ok: true;
      file: PayoffReportFile;
      issues: PayoffParseIssue[];
      model: string;
      usage: PayoffExtractionUsage;
    }
  | { ok: false; error: PayoffExtractionError; status?: number };

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

/** The request body sent to the Messages API. Exported for tests. */
export function buildPayoffExtractionRequest(pdf: Uint8Array, model: string) {
  return {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: PAYOFF_REPORT_INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: toBase64(pdf) },
          },
          { type: "text", text: "Copy every loan and track in this report into the schema." },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: PAYOFF_REPORT_JSON_SCHEMA } },
  };
}

interface MessagesResponse {
  stop_reason?: string | null;
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

type AttemptResult =
  | { ok: true; raw: unknown; inputTokens: number; outputTokens: number }
  | { ok: false; error: PayoffExtractionError; status?: number };

async function requestExtraction(
  pdf: Uint8Array,
  model: string,
  input: PayoffExtractionInput,
): Promise<AttemptResult> {
  const doFetch = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": input.apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify(buildPayoffExtractionRequest(pdf, model)),
      signal: input.signal,
    });
  } catch {
    return { ok: false, error: "api-error" };
  }

  if (response.status === 429 || response.status === 529) {
    return { ok: false, error: "busy", status: response.status };
  }
  if (!response.ok) return { ok: false, error: "api-error", status: response.status };

  let body: MessagesResponse;
  try {
    body = (await response.json()) as MessagesResponse;
  } catch {
    return { ok: false, error: "api-error", status: response.status };
  }

  if (body.stop_reason === "refusal") return { ok: false, error: "refused" };
  if (body.stop_reason === "max_tokens") return { ok: false, error: "truncated" };

  const text = (body.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
  try {
    return {
      ok: true,
      raw: JSON.parse(text),
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
    };
  } catch {
    return { ok: false, error: "unreadable" };
  }
}

export async function extractPayoffReport(
  input: PayoffExtractionInput,
): Promise<PayoffExtractionResult> {
  const model = input.model || DEFAULT_PAYOFF_REPORT_MODEL;
  const trimmed =
    input.trimPages === false
      ? { pdf: input.pdf, totalPages: null, keptPages: null }
      : await trimPayoffPdf(input.pdf);

  let attempt = await requestExtraction(trimmed.pdf, model, input);
  let parsed = attempt.ok ? parsePayoffReportFile(attempt.raw, input.fileName) : null;
  let pagesSent = trimmed.keptPages?.length ?? trimmed.totalPages;
  let inputTokens = attempt.ok ? attempt.inputTokens : 0;
  let outputTokens = attempt.ok ? attempt.outputTokens : 0;

  // If the trimmed document yielded nothing usable, the filter may have
  // dropped a page that mattered: read the whole file once before giving up.
  const unusable = attempt.ok ? !parsed?.ok : attempt.error === "unreadable";
  if (unusable && trimmed.keptPages !== null) {
    attempt = await requestExtraction(input.pdf, model, input);
    parsed = attempt.ok ? parsePayoffReportFile(attempt.raw, input.fileName) : null;
    pagesSent = trimmed.totalPages;
    if (attempt.ok) {
      inputTokens += attempt.inputTokens;
      outputTokens += attempt.outputTokens;
    }
  }

  if (!attempt.ok) return { ok: false, error: attempt.error, status: attempt.status };
  if (!parsed?.ok) return { ok: false, error: "unreadable" };
  return {
    ok: true,
    file: parsed.file,
    issues: parsed.issues,
    model,
    usage: { inputTokens, outputTokens, totalPages: trimmed.totalPages, pagesSent },
  };
}
