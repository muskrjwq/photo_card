import generatedCatalog from "./rescene-catalog.generated.json";
import type { CatalogCard } from "./types";

export interface RecognitionIndexEntry {
  dHash: string;
  histogram: number[];
}

export const catalogCards = generatedCatalog.cards as unknown as CatalogCard[];
export const collections = generatedCatalog.collections;
export const members = [...generatedCatalog.members, "단체", "유닛"];
export const recognitionIndex = generatedCatalog.features as Record<string, RecognitionIndexEntry>;
