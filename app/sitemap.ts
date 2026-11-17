import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{
    url: "https://poca.rescene.fun",
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 1,
  }];
}
