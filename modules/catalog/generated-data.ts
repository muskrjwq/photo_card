import generatedCatalog from "./rescene-catalog.generated.json";
import xfeatIndex from "./xfeat-index.generated.json";
import type { CatalogCard } from "./types";

export const catalogCards = generatedCatalog.cards as unknown as CatalogCard[];
export const collections = generatedCatalog.collections;
export const members = [...generatedCatalog.members, "단체", "유닛"];
export const recognitionXFeatIndex = xfeatIndex;
