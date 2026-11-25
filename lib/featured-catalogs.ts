export const catalogOrigin = "https://poca.rescene.fun";

export const featuredCatalogs = [
  {
    slug: "cu-bread",
    collections: ["CU리센느빵 시즌1", "CU리센느빵 시즌2"],
    label: ["CU 리센느빵", "CU RESCENE Bread"],
    title: ["리센느 CU 빵 포카 도감", "RESCENE CU Bread Photocard Catalog"],
    description: [
      "CU BAKE405 리센느빵 1차·2차 포토카드를 한곳에 모았습니다. 원이, 리브, 미나미, 메이, 제나와 단체·유닛 포카를 찾아보세요.",
      "Browse both waves of CU BAKE405 RESCENE bread photocards, including individual, group and unit cards.",
    ],
  },
  {
    slug: "pulse",
    collections: ["Pulse"],
    label: ["Pulse 펄스", "Pulse"],
    title: ["리센느 Pulse 펄스 포카 도감", "RESCENE Pulse Photocard Catalog"],
    description: [
      "리센느 Pulse(펄스) 앨범 포카와 특전 포토카드를 멤버별로 찾아보세요. 포카를 누르면 같은 시리즈의 다른 멤버 포카도 볼 수 있어요.",
      "Browse RESCENE Pulse album and benefit photocards by member, and open each card to explore its series.",
    ],
  },
  {
    slug: "lip-bomb",
    collections: ["Lip Bomb"],
    label: ["Lip Bomb 립밤", "Lip Bomb"],
    title: ["리센느 Lip Bomb 립밤 포카 도감", "RESCENE Lip Bomb Photocard Catalog"],
    description: [
      "리센느 Lip Bomb(립밤) 앨범 포카와 구매처별 특전 포토카드를 모았습니다. 멤버를 고르거나 포카 이름으로 검색해 보세요.",
      "Explore RESCENE Lip Bomb album photocards and retailer benefits. Filter by member or search by card name.",
    ],
  },
] as const;

export type FeaturedCatalog = (typeof featuredCatalogs)[number];

export function featuredCatalogPath(slug: string) {
  return `/catalog/${slug}`;
}
