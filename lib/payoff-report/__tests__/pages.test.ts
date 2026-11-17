import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { countAmounts, selectDataPages, trimPayoffPdf } from "../pages";

const dataPage = "Principal 279,093.54 Interest 103.26 Fees 672.85 Total 279,869.65 Payment 1,951.19";
const boilerplate = "Early repayment fees are calculated under the Banking Order. Call 6062.";

describe("countAmounts", () => {
  it("counts money amounts with agorot", () => {
    expect(countAmounts(dataPage)).toBe(5);
    expect(countAmounts("rate 4.44% and 60")).toBe(1);
    expect(countAmounts(boilerplate)).toBe(0);
  });
});

describe("selectDataPages", () => {
  it("keeps pages with figures, in order", () => {
    expect(selectDataPages([boilerplate, dataPage, boilerplate, dataPage])).toEqual([1, 3]);
  });

  it("sends the whole document when nothing would be dropped or kept", () => {
    expect(selectDataPages([dataPage, dataPage])).toBeNull();
    expect(selectDataPages(["", ""])).toBeNull(); // scanned, no text layer
    expect(selectDataPages([])).toBeNull();
  });
});

async function makePdf(pages: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const text of pages) pdf.addPage().drawText(text, { x: 20, y: 700, size: 9, font });
  return pdf.save();
}

describe("trimPayoffPdf", () => {
  it("drops boilerplate pages", async () => {
    const input = await makePdf([boilerplate, dataPage, boilerplate]);
    const result = await trimPayoffPdf(input);
    expect(result.totalPages).toBe(3);
    expect(result.keptPages).toEqual([1]);
    const trimmed = await PDFDocument.load(result.pdf);
    expect(trimmed.getPageCount()).toBe(1);
  });

  it("accepts a Node Buffer as well as a Uint8Array", async () => {
    const input = Buffer.from(await makePdf([boilerplate, dataPage]));
    expect((await trimPayoffPdf(input)).keptPages).toEqual([1]);
  });

  it("returns the input untouched when there is nothing to drop", async () => {
    const input = await makePdf([dataPage]);
    const result = await trimPayoffPdf(input);
    expect(result.keptPages).toBeNull();
    expect(result.pdf).toBe(input);
  });

  it("falls back to the input when the file cannot be parsed", async () => {
    const input = new TextEncoder().encode("%PDF-1.7 not really a pdf");
    expect(await trimPayoffPdf(input)).toEqual({ pdf: input, totalPages: null, keptPages: null });
  });
});
