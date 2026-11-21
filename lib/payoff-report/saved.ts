import { parsePayoffReportFile } from "./parse";
import type { PayoffLoan } from "./types";

/** The user's saved current mortgage, as loaded for a page. */
export interface SavedMyMortgage {
  loans: PayoffLoan[];
  updatedAt: string;
}

/** Same validation as model output: unknown input in, typed loans out. */
export function readSavedLoans(value: unknown): PayoffLoan[] | null {
  const parsed = parsePayoffReportFile({ loans: value }, "saved", "confirmed");
  return parsed.ok ? parsed.file.loans : null;
}
