import type { Metadata } from "next";

import ShopPage, { generateMetadata as shopMetadata } from "@/app/(routes)/tienda/page";
import { StaticUrlState } from "@/components/shop/static-url-state";
import { CACHED_LISTING_PARAMS } from "@/lib/cached-listing";

/**
 * /tienda sin filtros, en caché ISR. El middleware reescribe aquí las visitas
 * sin parámetros de catálogo; con filtros, búsqueda u orden sigue la ruta
 * dinámica. Nunca lee `searchParams`: eso volvería dinámica la ruta.
 */
export const revalidate = 300;
export const maxDuration = 30;

const NO_FILTERS = CACHED_LISTING_PARAMS as unknown as Parameters<typeof ShopPage>[0]["searchParams"];

export function generateMetadata(): Promise<Metadata> {
  return shopMetadata({ searchParams: NO_FILTERS });
}

export default function CachedShopPage() {
  return (
    <StaticUrlState>
      <ShopPage searchParams={NO_FILTERS} />
    </StaticUrlState>
  );
}
