import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PocaPocketApp from "@/components/pocapocket-app";
import { featuredCatalogPath, featuredCatalogs } from "@/lib/featured-catalogs";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return featuredCatalogs.map(({ slug }) => ({ slug }));
}

async function getCatalog(params: Props["params"]) {
  const { slug } = await params;
  const catalog = featuredCatalogs.find((item) => item.slug === slug);
  if (!catalog) notFound();
  return catalog;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const catalog = await getCatalog(params);
  const [title] = catalog.title;
  const [description] = catalog.description;
  const url = featuredCatalogPath(catalog.slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "리센느 포카도감", locale: "ko_KR", title, description, url },
  };
}

export default async function FeaturedCatalogPage({ params }: Props) {
  return <PocaPocketApp featuredCatalog={await getCatalog(params)} />;
}
