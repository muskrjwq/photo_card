import type { CatalogCard } from "./types";

// Album release dates and event opening dates (KST). Keep this independent
// from the collection selector order: the selector is curated for browsing,
// while this table exists only for chronological sorting.
const collectionDates: Record<string, string> = {
  "Re:Scene": "2024-03-26",
  Scenedrome: "2024-08-27",
  "Glow Up": "2025-02-05",
  응원봉: "2025-02-03",
  팬클럽: "2025-04-17",
  "KCON-Japan": "2025-05-09",
  기타: "2025-05-31",
  Dearest: "2025-07-02",
  팬콘: "2025-08-09",
  "Lip Bomb": "2025-11-25",
  "Pretty Girl": "2026-07-08",
  카사베르디: "2026-07-29",
  도미노스: "2026-07-31",
  에이페: "2026-08-13",
  한스킨: "2026-08-24",
  할리스커피: "2026-08-26",
  나랑드: "2026-09-01",
  "CU리센느빵 시즌1": "2026-09-17",
  MLB: "2026-10-07",
  "CU리센느빵 시즌2": "2026-10-25",
  와키윌리: "2026-10-30",
  "CU 덕연이 딸 도시락": "2026-11-02",
  Pulse: "2026-11-03",
};

function specificEventDate(card: Pick<CatalogCard, "collection" | "name">) {
  if (card.collection === "기타" && /^더현대 /.test(card.name)) return "2026-09-15";
  if (card.collection === "Pretty Girl") {
    if (/Week 2/i.test(card.name)) return "2026-07-15";
    if (/Week 3/i.test(card.name)) return "2026-07-22";
  }
  if (card.collection === "카사베르디" && card.name === "#2") return "2026-08-07";
  if (card.collection === "한스킨" && /무신사 단독컷/.test(card.name)) return "2026-09-23";
  return null;
}

function specificSequence(card: Pick<CatalogCard, "collection" | "name">) {
  const pulseRelease = Date.parse(`${collectionDates.Pulse}T00:00:00+09:00`);
  if (card.collection === "기타" && card.name === "성수 팝업") return pulseRelease + 1;
  if (card.collection === "도미노스" && card.name === "도미노스 시즌2") return pulseRelease + 2;
  return null;
}

export function getCatalogChronology(card: Pick<CatalogCard, "collection" | "name">) {
  const sequence = specificSequence(card);
  if (sequence !== null) return sequence;
  const date = specificEventDate(card) ?? collectionDates[card.collection] ?? "9999-12-31";
  return Date.parse(`${date}T00:00:00+09:00`);
}

export const catalogChronologyDates = collectionDates;
