import { extractText, getDocumentProxy } from "unpdf";

/**
 * Keep whole PDF pages so amounts retain their headers and columns. Pages
 * with no meaningful text may be scans. Only trim when at least one page
 * has a dense table, and preserve sparse amounts and dated sections too.
 */
export const MIN_AMOUNTS_PER_DATA_PAGE = 5;

const AMOUNT = /\d{1,3}(?:,\d{3})*\.\d{2}/g;

export function countAmounts(text: string): number {
  return text.match(AMOUNT)?.length ?? 0;
}

/**
 * 0-based pages to send, or null to send the document as it is (no usable
 * text layer, nothing to drop, or nothing that looks like data).
 */
export function selectDataPages(pageTexts: readonly string[]): number[] | null {
  const counts = pageTexts.map(countAmounts);
  if (!counts.some((count) => count >= MIN_AMOUNTS_PER_DATA_PAGE)) return null;
  const keep = pageTexts.flatMap((text, index) => {
    const possibleScan = !/[a-zא-ת]{2}/i.test(text) || /^(?:page|עמוד)\s*[\d\s/]+$/i.test(text.trim());
    const reportDate = /\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/.test(text);
    return counts[index] > 0 || possibleScan || reportDate ? [index] : [];
  });
  if (keep.length === pageTexts.length) return null;
  return keep;
}

export interface TrimmedPdf {
  pdf: Uint8Array;
  totalPages: number | null;
  /** 0-based pages kept; null when the whole document is sent. */
  keptPages: number[] | null;
}

export async function trimPayoffPdf(pdf: Uint8Array): Promise<TrimmedPdf> {
  try {
    // pdf.js may transfer the buffer it is given and rejects Node Buffers,
    // so hand it a plain Uint8Array copy.
    const document = await getDocumentProxy(new Uint8Array(pdf));
    const totalPages = document.numPages;
    let keep: number[] | null;
    try {
      if (totalPages === 1) return { pdf, totalPages, keptPages: null };
      const { text } = await extractText(document, { mergePages: false });
      keep = selectDataPages(text);
    } finally {
      await document.loadingTask.destroy();
    }
    if (keep === null) return { pdf, totalPages, keptPages: null };

    const { PDFDocument } = await import("pdf-lib");
    const source = await PDFDocument.load(pdf, { ignoreEncryption: true });
    const trimmed = await PDFDocument.create();
    for (const page of await trimmed.copyPages(source, keep)) trimmed.addPage(page);
    return { pdf: await trimmed.save(), totalPages, keptPages: keep };
  } catch {
    return { pdf, totalPages: null, keptPages: null };
  }
}
