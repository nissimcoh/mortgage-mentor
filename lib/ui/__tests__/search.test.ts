import { describe, expect, it } from "vitest";
import { normalizeSearchText, rankSearchItems, type SearchItem } from "../search";

const item = (kind: SearchItem["kind"], title: string, detail = "", keywords = ""): SearchItem =>
  ({ kind, title, detail, keywords, href: `/${title}` });

const ITEMS = [
  item("page", "מחשבון", "בנו תמהיל והשוו בין מסלולים"),
  item("page", "שמורים", "תרחישים ששמרתם"),
  item("term", "ריבית בנק ישראל וריבית פריים", "הפריים הוא ריבית בנק ישראל ועוד 1.5"),
  item("term", "קל״צ", "ריבית קבועה לא צמודה", "ריביות ומסלולים"),
  item("term", "תמהיל משכנתא", "חלוקה לכמה מסלולים, למשל פריים וקל״צ"),
];

describe("normalizeSearchText", () => {
  it("ignores case, quote marks and extra spaces", () => {
    expect(normalizeSearchText('  קל"צ  ')).toBe("קלצ");
    expect(normalizeSearchText("קל״צ")).toBe("קלצ");
    expect(normalizeSearchText("Prime   RATE")).toBe("prime rate");
  });
});

describe("rankSearchItems", () => {
  it("lists pages only when the query is empty", () => {
    expect(rankSearchItems(ITEMS, "  ").map((result) => result.title)).toEqual(["מחשבון", "שמורים"]);
  });

  it("ranks a title match above a match in the description", () => {
    const titles = rankSearchItems(ITEMS, "פריים").map((result) => result.title);
    expect(titles[0]).toBe("ריבית בנק ישראל וריבית פריים");
    expect(titles).toContain("תמהיל משכנתא");
    expect(titles).not.toContain("שמורים");
  });

  it("finds an acronym typed without its quote mark", () => {
    expect(rankSearchItems(ITEMS, "קלצ")[0].title).toBe("קל״צ");
  });

  it("requires every word of the query to match", () => {
    expect(rankSearchItems(ITEMS, "ריבית פריים").map((result) => result.title)).toEqual(["ריבית בנק ישראל וריבית פריים"]);
    expect(rankSearchItems(ITEMS, "ריבית אבטיח")).toEqual([]);
  });

  it("matches hidden keywords and respects the limit", () => {
    expect(rankSearchItems(ITEMS, "ריביות").map((result) => result.title)).toEqual(["קל״צ"]);
    expect(rankSearchItems(ITEMS, "מ", 1)).toHaveLength(1);
  });
});
