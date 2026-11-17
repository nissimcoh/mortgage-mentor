import { describe, expect, it } from "vitest";
import { MAX_PAYOFF_PDF_BYTES, isPdf, readPayoffUpload } from "../upload";

function form(file?: Blob) {
  const data = new FormData();
  if (file) data.set("file", file);
  return data;
}

const pdfBytes = new TextEncoder().encode("%PDF-1.7\nfictional");

describe("readPayoffUpload", () => {
  it("accepts a PDF and keeps its name", async () => {
    const result = await readPayoffUpload(form(new File([pdfBytes], "דוח.pdf")));
    expect(result).toEqual({ ok: true, pdf: pdfBytes, fileName: "דוח.pdf" });
  });

  it("judges by content, not by name or declared type", async () => {
    const disguised = new File(["<html>"], "report.pdf", { type: "application/pdf" });
    expect(await readPayoffUpload(form(disguised))).toEqual({ ok: false, error: "not-pdf" });
    const unnamed = await readPayoffUpload(form(new File([pdfBytes], " ")));
    expect(unnamed.ok && unnamed.fileName).toBe("report.pdf");
  });

  it("rejects missing, empty and oversized files", async () => {
    expect(await readPayoffUpload(form())).toEqual({ ok: false, error: "missing-file" });
    expect(await readPayoffUpload(form(new File([], "a.pdf")))).toEqual({
      ok: false,
      error: "empty",
    });
    const big = new Uint8Array(MAX_PAYOFF_PDF_BYTES + 1);
    big.set(pdfBytes);
    expect(await readPayoffUpload(form(new File([big], "a.pdf")))).toEqual({
      ok: false,
      error: "too-large",
    });
  });
});

describe("isPdf", () => {
  it("checks the %PDF- header", () => {
    expect(isPdf(pdfBytes)).toBe(true);
    expect(isPdf(new TextEncoder().encode("%PD"))).toBe(false);
  });
});
