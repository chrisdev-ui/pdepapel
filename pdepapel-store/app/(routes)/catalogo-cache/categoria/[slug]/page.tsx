import type { Metadata } from "next";

import CategoryPage, { generateMetadata as categoryMetadata } from "@/app/(routes)/categoria/[slug]/page";
import { StaticUrlState } from "@/components/shop/static-url-state";
import { CACHED_LISTING_PARAMS } from "@/lib/cached-listing";

/** /categoria/<slug> sin filtros, en caché ISR (ver la copia de /tienda). */
export const revalidate = 300;
export const maxDuration = 30;

export function generateStaticParams() {
  return [];
}

const NO_FILTERS = CACHED_LISTING_PARAMS as Parameters<typeof CategoryPage>[0]["searchParams"];

export function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  return categoryMetadata({ params, searchParams: NO_FILTERS });
}

export default function CachedCategoryPage({ params }: { params: { slug: string } }) {
  return (
    <StaticUrlState>
      <CategoryPage params={params} searchParams={NO_FILTERS} />
    </StaticUrlState>
  );
}
