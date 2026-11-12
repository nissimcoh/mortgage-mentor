/** Shapes and ranking for the header search palette. Pure, so it is unit-tested. */

export interface SearchItem {
  kind: "page" | "term";
  title: string;
  /** One line of context: a page description or the start of a definition. */
  detail: string;
  /** Extra text that should match but is not shown (category, example). */
  keywords: string;
  href: string;
}

/** Lowercase, drop Hebrew/Latin quote marks and niqqud so קל"צ matches קלצ. */
export function normalizeSearchText(text: string): string {
  return text.toLocaleLowerCase().replace(/[֑-ׇ״׳'"“”‘’]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Rank items for a query. Every word of the query must appear somewhere in
 * the item; a title match outranks a detail match, and a match at the start
 * of the title outranks one in the middle. An empty query returns pages
 * first, then terms, in their original order.
 */
export function rankSearchItems(items: readonly SearchItem[], query: string, limit = 8): SearchItem[] {
  const words = normalizeSearchText(query).split(" ").filter(Boolean);
  if (words.length === 0) return items.filter((item) => item.kind === "page").slice(0, limit);

  const scored: { item: SearchItem; score: number; order: number }[] = [];
  items.forEach((item, order) => {
    const title = normalizeSearchText(item.title);
    const detail = normalizeSearchText(item.detail);
    const keywords = normalizeSearchText(item.keywords);
    let score = 0;
    for (const word of words) {
      if (title.startsWith(word)) score += 100;
      else if (title.includes(` ${word}`)) score += 60;
      else if (title.includes(word)) score += 40;
      else if (detail.includes(word)) score += 10;
      else if (keywords.includes(word)) score += 4;
      else return;
    }
    if (item.kind === "page") score += 5;
    scored.push({ item, score, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit).map((entry) => entry.item);
}
