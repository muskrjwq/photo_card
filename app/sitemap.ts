import type { MetadataRoute } from "next";
import { catalogOrigin, featuredCatalogPath, featuredCatalogs } from "@/lib/featured-catalogs";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${catalogOrigin}/` },
    ...featuredCatalogs.map(({ slug }) => ({ url: `${catalogOrigin}${featuredCatalogPath(slug)}` })),
  ];
}
