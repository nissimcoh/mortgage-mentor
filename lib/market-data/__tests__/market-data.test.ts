import { describe, expect, it } from "vitest";
import {
  assembleSnapshot,
  derivePrimeRatePercent,
  isStale,
  selectNextDecisionDate,
  validateMarketSnapshot,
} from "../derive";
import { parseBoiRateCsv } from "../sources/bank-of-israel";
import { parseCbsCpiResponse } from "../sources/cbs";
import {
  FALLBACK_BOI_RATE,
  FALLBACK_CPI,
  FALLBACK_VERIFIED_AT,
} from "../fallback-snapshot";

// All tests run on fixtures captured from the real APIs — no network calls.

/** Captured from the BOI SDMX BR dataflow (series MNT_RIB_BOI_D), 2026-07-09. */
const BOI_CSV_FIXTURE = [
  "SERIES_CODE,FREQ,IR_FV_TYPE,DATA_SOURCE,TIME_COLLECT,CONF_STATUS,PUB_WEBSITE,UNIT_MEASURE,UNIT_MULT,TIME_PERIOD,OBS_VALUE,RELEASE_STATUS",
  "MNT_RIB_BOI_D,D,RIB_BOI,BOI,V,F,Y,PT,0,2026-07-06,3.75,YP",
  "MNT_RIB_BOI_D,D,RIB_BOI,BOI,V,F,Y,PT,0,2026-07-07,3.75,YP",
  "MNT_RIB_BOI_D,D,RIB_BOI,BOI,V,F,Y,PT,0,2026-07-08,3.75,YP",
  "MNT_RIB_BOI_D,D,RIB_BOI,BOI,V,F,Y,PT,0,2026-07-09,3.5,YP",
].join("\n");

/** Captured from api.cbs.gov.il/index/data/price?id=120010, 2026-07-09. */
const CBS_JSON_FIXTURE = {
  month: [
    {
      code: 120010,
      name: "מדד המחירים לצרכן - כללי",
      date: [
        {
          year: 2026,
          percent: -0.3,
          percentYear: 1.9,
          currBase: { baseDesc: "2024 ממוצע", value: 104.8 },
          prevBase: null,
          month: 5,
          monthDesc: "מאי",
        },
        {
          year: 2026,
          percent: 1.2,
          percentYear: 1.9,
          currBase: { baseDesc: "2024 ממוצע", value: 105.1 },
          prevBase: null,
          month: 4,
          monthDesc: "אפריל",
        },
      ],
    },
  ],
  quarter: null,
};

const NOW = new Date("2026-07-09T12:00:00+03:00");

describe("prime derivation", () => {
  it("adds 1.5 percentage points to the BOI rate", () => {
    expect(derivePrimeRatePercent(3.5)).toBe(5);
    expect(derivePrimeRatePercent(0)).toBe(1.5);
    expect(derivePrimeRatePercent(4.35)).toBe(5.85);
  });
});

describe("next-decision selection", () => {
  it("picks the earliest strictly-future date from an unsorted list", () => {
    expect(
      selectNextDecisionDate(
        [
          "2026-11-23T16:00:00+02:00",
          "2026-09-01T16:00:00+03:00",
          "2026-01-05T16:00:00+02:00", // past
        ],
        NOW,
      ),
    ).toBe("2026-09-01T16:00:00+03:00");
  });

  it("returns null when no future date exists", () => {
    expect(selectNextDecisionDate(["2026-01-05T16:00:00+02:00"], NOW)).toBeNull();
    expect(selectNextDecisionDate([], NOW)).toBeNull();
    expect(selectNextDecisionDate(["not-a-date"], NOW)).toBeNull();
  });
});

describe("stale-status calculation", () => {
  it("flags dates older than the threshold", () => {
    expect(isStale("2026-07-03", NOW, 7)).toBe(false);
    expect(isStale("2026-07-01", NOW, 7)).toBe(true); // 8+ days old
    expect(isStale("2026-06-25", NOW, 7)).toBe(true);
    expect(isStale("2026-07-09", NOW, 7)).toBe(false);
  });

  it("treats unparseable dates as stale", () => {
    expect(isStale("garbage", NOW, 7)).toBe(true);
  });
});

describe("BOI SDMX CSV parsing", () => {
  it("extracts the latest rate and the start of its value run", () => {
    expect(parseBoiRateCsv(BOI_CSV_FIXTURE)).toEqual({
      ratePercent: 3.5,
      effectiveDate: "2026-07-09",
      lastObservationDate: "2026-07-09",
    });
  });

  it("finds the effective date across a multi-day run", () => {
    const csv = [
      "SERIES_CODE,FREQ,IR_FV_TYPE,DATA_SOURCE,TIME_COLLECT,CONF_STATUS,PUB_WEBSITE,UNIT_MEASURE,UNIT_MULT,TIME_PERIOD,OBS_VALUE,RELEASE_STATUS",
      "MNT_RIB_BOI_D,D,RIB_BOI,BOI,V,F,Y,PT,0,2026-07-01,3.75,YP",
      "MNT_RIB_BOI_D,D,RIB_BOI,BOI,V,F,Y,PT,0,2026-07-02,3.5,YP",
      "MNT_RIB_BOI_D,D,RIB_BOI,BOI,V,F,Y,PT,0,2026-07-03,3.5,YP",
    ].join("\n");
    expect(parseBoiRateCsv(csv)).toEqual({
      ratePercent: 3.5,
      effectiveDate: "2026-07-02",
      lastObservationDate: "2026-07-03",
    });
  });

  it("rejects empty or malformed CSV", () => {
    expect(() => parseBoiRateCsv("")).toThrow(/no data rows/);
    expect(() => parseBoiRateCsv("A,B,C\n1,2,3")).toThrow(/header/);
    expect(() =>
      parseBoiRateCsv(
        "SERIES_CODE,TIME_PERIOD,OBS_VALUE\nMNT_RIB_BOI_D,not-a-date,xyz",
      ),
    ).toThrow(/no valid observations/);
  });
});

describe("CBS CPI parsing", () => {
  it("extracts the newest month from the captured fixture", () => {
    expect(parseCbsCpiResponse(CBS_JSON_FIXTURE)).toEqual({
      referenceYear: 2026,
      referenceMonth: 5,
      monthlyChangePercent: -0.3,
      indexValue: 104.8,
    });
  });

  it("picks the newest month regardless of response order", () => {
    const shuffled = structuredClone(CBS_JSON_FIXTURE);
    shuffled.month[0].date.reverse();
    expect(parseCbsCpiResponse(shuffled).referenceMonth).toBe(5);
  });

  it("rejects unexpected series codes and empty responses", () => {
    expect(() =>
      parseCbsCpiResponse({ month: [{ code: 999, date: [] }] }),
    ).toThrow(/unexpected/);
    expect(() => parseCbsCpiResponse(null)).toThrow(/unexpected/);
    expect(() =>
      parseCbsCpiResponse({ month: [{ code: 120010, date: [] }] }),
    ).toThrow(/no observations/);
  });
});

describe("snapshot assembly and fallback behavior", () => {
  const liveBoi = {
    ratePercent: 3.5,
    effectiveDate: "2026-07-09",
    lastObservationDate: "2026-07-09",
  };
  const liveCpi = {
    referenceYear: 2026,
    referenceMonth: 5,
    monthlyChangePercent: -0.3,
    indexValue: 104.8,
  };

  it("is live when both sources delivered, with derived prime", () => {
    const snapshot = assembleSnapshot(
      { boi: liveBoi, cpi: liveCpi, errors: [] },
      NOW,
    );
    expect(snapshot.status).toBe("live");
    expect(snapshot.boiRate.isLive).toBe(true);
    expect(snapshot.primeRate).toEqual({ ratePercent: 5, isLive: true });
    expect(snapshot.cpi.isLive).toBe(true);
    // Reference data has no machine source yet, so it is never live.
    expect(snapshot.nextDecision.isLive).toBe(false);
    expect(snapshot.inflationForecast.isLive).toBe(false);
    expect(validateMarketSnapshot(snapshot)).toBe(true);
  });

  it("degrades to partial when one source fails", () => {
    const snapshot = assembleSnapshot(
      {
        boi: null,
        cpi: liveCpi,
        errors: [{ sourceId: "boi-sdmx-br", message: "timeout" }],
      },
      NOW,
    );
    expect(snapshot.status).toBe("partial");
    expect(snapshot.boiRate.isLive).toBe(false);
    expect(snapshot.boiRate.ratePercent).toBe(FALLBACK_BOI_RATE.ratePercent);
    expect(snapshot.primeRate.isLive).toBe(false);
    expect(snapshot.errors).toHaveLength(1);
    expect(validateMarketSnapshot(snapshot)).toBe(true);
  });

  it("degrades to fallback when everything fails, keeping the verification date", () => {
    const snapshot = assembleSnapshot(
      {
        boi: null,
        cpi: null,
        errors: [
          { sourceId: "boi-sdmx-br", message: "unreachable" },
          { sourceId: "cbs-index-api-120010", message: "unreachable" },
        ],
      },
      NOW,
    );
    expect(snapshot.status).toBe("fallback");
    expect(snapshot.fallbackVerifiedAt).toBe(FALLBACK_VERIFIED_AT);
    expect(snapshot.cpi.indexValue).toBe(FALLBACK_CPI.indexValue);
    expect(snapshot.cpi.isLive).toBe(false);
    expect(snapshot.primeRate.ratePercent).toBe(
      derivePrimeRatePercent(FALLBACK_BOI_RATE.ratePercent),
    );
    expect(snapshot.nextDecision.at).toBe("2026-09-01T16:00:00+03:00");
    expect(validateMarketSnapshot(snapshot)).toBe(true);
  });

  it("marks live-but-old observations as stale", () => {
    const snapshot = assembleSnapshot(
      {
        boi: { ...liveBoi, lastObservationDate: "2026-06-01" },
        cpi: { ...liveCpi, referenceYear: 2025, referenceMonth: 12 },
        errors: [],
      },
      NOW,
    );
    expect(snapshot.boiRate.isLive).toBe(true);
    expect(snapshot.boiRate.isStale).toBe(true);
    expect(snapshot.cpi.isStale).toBe(true);
  });
});
