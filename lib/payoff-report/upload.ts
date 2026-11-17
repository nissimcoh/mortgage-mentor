/**
 * Validation of an uploaded payoff-report file before it is sent anywhere.
 * Kept free of Next.js imports so it can be tested directly.
 */

/** Below Vercel's 4.5 MB request-body limit, with room for the form overhead. */
export const MAX_PAYOFF_PDF_BYTES = 4 * 1024 * 1024;

export type PayoffUploadError = "missing-file" | "empty" | "too-large" | "not-pdf";

export type PayoffUploadResult =
  | { ok: true; pdf: Uint8Array; fileName: string }
  | { ok: false; error: PayoffUploadError };

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Checks the bytes, not the name or declared type, which the client controls. */
export function isPdf(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((byte, index) => bytes[index] === byte);
}

/** Reads the `file` field of a multipart form. */
export async function readPayoffUpload(form: FormData): Promise<PayoffUploadResult> {
  const file = form.get("file");
  if (!(file instanceof Blob)) return { ok: false, error: "missing-file" };
  if (file.size === 0) return { ok: false, error: "empty" };
  if (file.size > MAX_PAYOFF_PDF_BYTES) return { ok: false, error: "too-large" };
  const pdf = new Uint8Array(await file.arrayBuffer());
  if (!isPdf(pdf)) return { ok: false, error: "not-pdf" };
  const name = file instanceof File && file.name.trim() !== "" ? file.name : "report.pdf";
  return { ok: true, pdf, fileName: name.slice(0, 200) };
}
