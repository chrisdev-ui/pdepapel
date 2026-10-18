import type { Metadata } from "next";

import { getBrands } from "@/actions/get-brands";
import BrandPage, { generateMetadata as brandMetadata } from "@/app/(routes)/marcas/[slug]/page";
import { StaticUrlState } from "@/components/shop/static-url-state";

/** /marcas/<slug> sin filtros, en caché ISR (ver la copia de /tienda). */
export const revalidate = 300;

/** Las marcas visibles con productos se generan en el build; el resto, la primera vez que alguien las pide. */
export async function generateStaticParams() {
  const brands = await getBrands();
  return brands.map((brand) => ({ slug: brand.slug }));
}

const NO_FILTERS = {} as Parameters<typeof BrandPage>[0]["searchParams"];

export function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  return brandMetadata({ params, searchParams: NO_FILTERS });
}

export default function CachedBrandPage({ params }: { params: { slug: string } }) {
  return (
    <StaticUrlState>
      <BrandPage params={params} searchParams={NO_FILTERS} />
    </StaticUrlState>
  );
}
