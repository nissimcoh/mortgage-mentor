import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Drops the pages of a payoff report that cannot hold loan figures before it
 * is sent to the model. Most of a report is boilerplate the bank attaches to
 * every customer (Q&A, fee explanations, notice forms), and the model is
 * billed per page. Bank-neutral on purpose: a page is kept unless it has
 * almost no money amounts in its text layer, so an explanatory page with
 * worked examples may stay but a page with figures is never dropped.
 *
 * Server-only. Any failure, a scanned PDF without text, or a selection that
 * would keep nothing falls back to the whole document.
 */

/** Pages with fewer amounts than this are boilerplate. Data pages have 15+. */
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
  const keep = counts.flatMap((count, index) => (count >= MIN_AMOUNTS_PER_DATA_PAGE ? [index] : []));
  if (keep.length === 0 || keep.length === pageTexts.length) return null;
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
    const { totalPages, text } = await extractText(document, { mergePages: false });
    const keep = selectDataPages(text);
    if (keep === null) return { pdf, totalPages, keptPages: null };

    const source = await PDFDocument.load(pdf, { ignoreEncryption: true });
    const trimmed = await PDFDocument.create();
    for (const page of await trimmed.copyPages(source, keep)) trimmed.addPage(page);
    return { pdf: await trimmed.save(), totalPages, keptPages: keep };
  } catch {
    return { pdf, totalPages: null, keptPages: null };
  }
}
