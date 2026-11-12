export type CardKind = "member" | "unit" | "group";

export interface CatalogCard {
  id: string;
  code: string;
  member: string;
  kind: CardKind;
  name: string;
  collection: string;
  category: "album" | "event";
  source: string;
  image: string;
  owners: number;
  rare?: boolean;
  sensitive?: boolean;
  tags: string[];
  idNumber: number;
}

export interface FeatureFlags {
  recognition: boolean;
  collections: boolean;
  publicAlbums: boolean;
  requests: boolean;
  blurUnowned: boolean;
}
