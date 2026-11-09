import type { FeatureFlags } from "./types";

export const defaultFeatures: FeatureFlags = {
  recognition: true,
  collections: true,
  publicAlbums: true,
  requests: true,
  blurUnowned: false,
};

export const catalogConfig = {
  groupName: "RESCENE",
  locale: "ko-KR",
  imagePolicy: "original" as "original" | "blur" | "owned-only",
  features: defaultFeatures,
};
