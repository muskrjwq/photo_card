import type { CatalogCard } from "./types";

export const members = ["원이", "리브", "미나미", "메이", "제나", "단체", "유닛"];
export const collections = ["SCENEDROME", "Glow Up", "2026 Season’s Greetings", "팬사인회 특전"];

export const catalogCards: CatalogCard[] = [
  { id: "scene-001", code: "SD-001", member: "원이", kind: "member", name: "SCENEDROME 원이 A", collection: "SCENEDROME", category: "album", source: "앨범 일반반", image: "/cards/card-01.svg", owners: 1284, tags: ["셀카", "꽃", "일반반"], idNumber: 1 },
  { id: "scene-002", code: "SD-002", member: "리브", kind: "member", name: "SCENEDROME 리브 B", collection: "SCENEDROME", category: "album", source: "앨범 QR반", image: "/cards/card-02.svg", owners: 963, tags: ["셀카", "QR반"], idNumber: 2 },
  { id: "scene-003", code: "SD-003", member: "미나미", kind: "member", name: "SCENEDROME 미나미 A", collection: "SCENEDROME", category: "album", source: "MAKESTAR 특전", image: "/cards/card-03.svg", owners: 742, rare: true, tags: ["특전", "브이"], idNumber: 3 },
  { id: "scene-004", code: "SD-004", member: "메이", kind: "member", name: "SCENEDROME 메이 C", collection: "SCENEDROME", category: "album", source: "withmuu 특전", image: "/cards/card-04.svg", owners: 808, tags: ["특전", "클로즈업"], idNumber: 4 },
  { id: "scene-005", code: "GU-001", member: "제나", kind: "member", name: "Glow Up 제나 A", collection: "Glow Up", category: "album", source: "앨범 POCA반", image: "/cards/card-05.svg", owners: 1107, tags: ["셀카", "POCA반"], idNumber: 5 },
  { id: "scene-006", code: "SG-001", member: "단체", kind: "group", name: "2026 Season’s Greetings 단체", collection: "2026 Season’s Greetings", category: "event", source: "예약 판매 특전", image: "/cards/card-06.svg", owners: 536, rare: true, tags: ["단체", "시즌그리팅"], idNumber: 6 },
  { id: "scene-007", code: "FS-001", member: "유닛", kind: "unit", name: "원이 · 리브 유닛", collection: "팬사인회 특전", category: "event", source: "서울 팬사인회", image: "/cards/card-07.svg", owners: 319, tags: ["유닛", "오프라인"], idNumber: 7 },
  { id: "scene-008", code: "GU-002", member: "메이", kind: "member", name: "Glow Up 메이 B", collection: "Glow Up", category: "album", source: "사운드웨이브 특전", image: "/cards/card-08.svg", owners: 675, sensitive: true, tags: ["특전", "미공개"], idNumber: 8 },
];
