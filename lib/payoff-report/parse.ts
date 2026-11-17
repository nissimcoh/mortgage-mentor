import type {
  IsoDate,
  PayoffBalance,
  PayoffFees,
  PayoffLinkage,
  PayoffLoan,
  PayoffRateType,
  PayoffReportFile,
  PayoffRepaymentMethod,
  PayoffTrack,
  PayoffTrackStatus,
  PayoffVariableRate,
} from "./types";

/**
 * Runtime validation of report data from an untrusted reader (an AI model's
 * JSON output). Unknown input becomes a typed `PayoffReportFile`; anything
 * malformed is reported as an issue and replaced by null, never guessed.
 */

export interface PayoffParseIssue {
  /** JSON-style path, e.g. `loans[0].tracks[1].balance.principal`. */
  path: string;
  message: string;
}

export type PayoffParseResult =
  | { ok: true; file: PayoffReportFile; issues: PayoffParseIssue[] }
  | { ok: false; issues: PayoffParseIssue[] };

const LINKAGES: readonly PayoffLinkage[] = ["unlinked", "cpi", "foreignCurrency", "unknown"];
const RATE_TYPES: readonly PayoffRateType[] = ["fixed", "variable", "prime", "unknown"];
const REPAYMENT_METHODS: readonly PayoffRepaymentMethod[] = [
  "spitzer",
  "equalPrincipal",
  "balloon",
  "unknown",
];
const STATUSES: readonly PayoffTrackStatus[] = ["active", "closed"];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_DATE = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/;

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Reader {
  readonly issues: PayoffParseIssue[] = [];

  issue(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  /** Numbers, or numeric strings as printed ("1,951.19", "4.44%", "₪60"). */
  number(value: unknown, path: string): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") {
      if (Number.isFinite(value)) return value;
      this.issue(path, "expected a finite number");
      return null;
    }
    if (typeof value === "string") {
      const cleaned = value.replace(/[,\s%₪]/g, "");
      if (/^-?\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
    }
    this.issue(path, "expected a number");
    return null;
  }

  text(value: unknown, path: string): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return value.trim() === "" ? null : value.trim();
    if (typeof value === "number") return String(value);
    this.issue(path, "expected text");
    return null;
  }

  /** `YYYY-MM-DD`, or `DD/MM/YYYY` as printed on Israeli reports. */
  date(value: unknown, path: string): IsoDate | null {
    const raw = this.text(value, path);
    if (raw === null) return null;
    const iso = ISO_DATE.exec(raw);
    if (iso && isRealDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))) return raw;
    const slash = SLASH_DATE.exec(raw);
    if (slash) {
      const [day, month, year] = [Number(slash[1]), Number(slash[2]), Number(slash[3])];
      if (isRealDate(year, month, day)) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
    this.issue(path, "expected a date (YYYY-MM-DD)");
    return null;
  }

  choice<T extends string>(
    value: unknown,
    path: string,
    allowed: readonly T[],
    fallback: T,
  ): T {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
      return value as T;
    }
    this.issue(path, `expected one of: ${allowed.join(", ")}`);
    return fallback;
  }

  /** A missing object reads as empty; a wrong type is an issue. */
  record(value: unknown, path: string): Record<string, unknown> {
    if (value === null || value === undefined) return {};
    if (isRecord(value)) return value;
    this.issue(path, "expected an object");
    return {};
  }
}

function readFees(reader: Reader, value: unknown, path: string): PayoffFees {
  const fees = reader.record(value, path);
  return {
    capitalization: reader.number(fees.capitalization, `${path}.capitalization`),
    capitalizationRatePercent: reader.number(
      fees.capitalizationRatePercent,
      `${path}.capitalizationRatePercent`,
    ),
    capitalizationReductionPercent: reader.number(
      fees.capitalizationReductionPercent,
      `${path}.capitalizationReductionPercent`,
    ),
    capitalizationReductionAmount: reader.number(
      fees.capitalizationReductionAmount,
      `${path}.capitalizationReductionAmount`,
    ),
    notice: reader.number(fees.notice, `${path}.notice`),
    averageCpi: reader.number(fees.averageCpi, `${path}.averageCpi`),
    operational: reader.number(fees.operational, `${path}.operational`),
    total: reader.number(fees.total, `${path}.total`),
  };
}

function readBalance(reader: Reader, value: unknown, path: string): PayoffBalance {
  const balance = reader.record(value, path);
  return {
    principal: reader.number(balance.principal, `${path}.principal`),
    indexation: reader.number(balance.indexation, `${path}.indexation`),
    accruedInterest: reader.number(balance.accruedInterest, `${path}.accruedInterest`),
    futureMonthlyCharge: reader.number(
      balance.futureMonthlyCharge,
      `${path}.futureMonthlyCharge`,
    ),
    arrears: reader.number(balance.arrears, `${path}.arrears`),
    otherCharges: reader.number(balance.otherCharges, `${path}.otherCharges`),
    totalToSettle: reader.number(balance.totalToSettle, `${path}.totalToSettle`),
  };
}

function readVariable(
  reader: Reader,
  value: unknown,
  path: string,
): PayoffVariableRate | null {
  if (value === null || value === undefined) return null;
  const variable = reader.record(value, path);
  const read: PayoffVariableRate = {
    marginPercent: reader.number(variable.marginPercent, `${path}.marginPercent`),
    anchorText: reader.text(variable.anchorText, `${path}.anchorText`),
    resetFrequencyMonths: reader.number(
      variable.resetFrequencyMonths,
      `${path}.resetFrequencyMonths`,
    ),
    nextResetDate: reader.date(variable.nextResetDate, `${path}.nextResetDate`),
    originalRatePercent: reader.number(
      variable.originalRatePercent,
      `${path}.originalRatePercent`,
    ),
  };
  // Readers that cannot output null send an all-empty object instead.
  return Object.values(read).every((field) => field === null) ? null : read;
}

function readTrack(
  reader: Reader,
  value: unknown,
  path: string,
  asOfDate: IsoDate | null,
): PayoffTrack {
  const track = reader.record(value, path);
  const endDate = reader.date(track.endDate, `${path}.endDate`);
  // With no status given, a track that ended before the report date is closed.
  const inferredStatus: PayoffTrackStatus =
    endDate !== null && asOfDate !== null && endDate < asOfDate ? "closed" : "active";
  return {
    label: reader.text(track.label, `${path}.label`),
    status: reader.choice(track.status, `${path}.status`, STATUSES, inferredStatus),
    loanTypeText: reader.text(track.loanTypeText, `${path}.loanTypeText`),
    originalAmount: reader.number(track.originalAmount, `${path}.originalAmount`),
    startDate: reader.date(track.startDate, `${path}.startDate`),
    firstPaymentDate: reader.date(track.firstPaymentDate, `${path}.firstPaymentDate`),
    endDate,
    monthlyPayment: reader.number(track.monthlyPayment, `${path}.monthlyPayment`),
    annualRatePercent: reader.number(track.annualRatePercent, `${path}.annualRatePercent`),
    repaymentMethod: reader.choice(
      track.repaymentMethod,
      `${path}.repaymentMethod`,
      REPAYMENT_METHODS,
      "unknown",
    ),
    linkage: reader.choice(track.linkage, `${path}.linkage`, LINKAGES, "unknown"),
    cpiBaseIndex: reader.number(track.cpiBaseIndex, `${path}.cpiBaseIndex`),
    rateType: reader.choice(track.rateType, `${path}.rateType`, RATE_TYPES, "unknown"),
    variable: readVariable(reader, track.variable, `${path}.variable`),
    fees: readFees(reader, track.fees, `${path}.fees`),
    balance: readBalance(reader, track.balance, `${path}.balance`),
  };
}

function readLoan(reader: Reader, value: unknown, path: string): PayoffLoan | null {
  if (!isRecord(value)) {
    reader.issue(path, "expected an object");
    return null;
  }
  const asOfDate = reader.date(value.asOfDate, `${path}.asOfDate`);
  const tracks: PayoffTrack[] = [];
  if (Array.isArray(value.tracks)) {
    value.tracks.forEach((track, index) =>
      tracks.push(readTrack(reader, track, `${path}.tracks[${index}]`, asOfDate)),
    );
  } else {
    reader.issue(`${path}.tracks`, "expected a list of tracks");
  }
  if (tracks.length === 0) {
    reader.issue(`${path}.tracks`, "loan has no tracks");
    return null;
  }
  const totals = reader.record(value.reportedTotals, `${path}.reportedTotals`);
  return {
    bankName: reader.text(value.bankName, `${path}.bankName`),
    loanNumber: reader.text(value.loanNumber, `${path}.loanNumber`),
    asOfDate,
    tracks,
    loanLevelFees: reader.number(value.loanLevelFees, `${path}.loanLevelFees`),
    reportedTotals: {
      monthlyPayment: reader.number(
        totals.monthlyPayment,
        `${path}.reportedTotals.monthlyPayment`,
      ),
      fees: reader.number(totals.fees, `${path}.reportedTotals.fees`),
      totalToSettle: reader.number(
        totals.totalToSettle,
        `${path}.reportedTotals.totalToSettle`,
      ),
    },
  };
}

/**
 * Validate one file's worth of report data. Fails only when no usable loan
 * remains; otherwise returns the file with every issue for the confirm step.
 */
export function parsePayoffReportFile(raw: unknown, fileName: string): PayoffParseResult {
  const reader = new Reader();
  if (!isRecord(raw)) {
    reader.issue("", "expected an object");
    return { ok: false, issues: reader.issues };
  }
  if (!Array.isArray(raw.loans)) {
    reader.issue("loans", "expected a list of loans");
    return { ok: false, issues: reader.issues };
  }
  const loans: PayoffLoan[] = [];
  raw.loans.forEach((loan, index) => {
    const parsed = readLoan(reader, loan, `loans[${index}]`);
    if (parsed) loans.push(parsed);
  });
  if (loans.length === 0) {
    reader.issue("loans", "no usable loan found");
    return { ok: false, issues: reader.issues };
  }
  return { ok: true, file: { fileName, loans }, issues: reader.issues };
}
