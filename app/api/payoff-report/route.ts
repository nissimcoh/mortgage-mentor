import { extractPayoffReport } from "@/lib/payoff-report/extract";
import { MAX_PAYOFF_PDF_BYTES, readPayoffUpload } from "@/lib/payoff-report/upload";
import { createClient } from "@/lib/supabase/server";

/**
 * POST one payoff-report PDF (multipart field `file`) and get back the
 * figures read from it, for the user to confirm. Signed-in users only.
 * The file is read in memory, sent to the model and dropped; nothing is
 * stored and its contents are never logged. Clients send several files as
 * parallel requests, so one unreadable file does not fail the others.
 *
 * Responses: { ok: true, file, issues } or { ok: false, error }.
 */

// Reading a long report takes the model up to ~30 seconds.
export const maxDuration = 60;

function failure(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return failure("unavailable", 503);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return failure("unauthenticated", 401);

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PAYOFF_PDF_BYTES + 64 * 1024) return failure("too-large", 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failure("bad-request", 400);
  }
  const upload = await readPayoffUpload(form);
  if (!upload.ok) {
    return failure(upload.error, upload.error === "too-large" ? 413 : upload.error === "not-pdf" ? 415 : 400);
  }

  const result = await extractPayoffReport({
    pdf: upload.pdf,
    fileName: upload.fileName,
    apiKey,
    model: process.env.PAYOFF_REPORT_MODEL,
    signal: request.signal,
  });
  if (!result.ok) {
    // Error code and upstream status only: never the document or the answer.
    console.error("payoff-report extraction failed", result.error, result.status ?? "");
    return failure(result.error, result.error === "busy" ? 503 : 502);
  }
  return Response.json({ ok: true, file: result.file, issues: result.issues });
}
