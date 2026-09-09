import { Ghost, Gift, Snowflake, Sparkles } from "lucide-react";
import Link from "next/link";

import { getProducts } from "@/actions/get-products";
import { SectionHeading } from "@/components/home/section-heading";
import ProductCard from "@/components/ui/product-card";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { Product, Season } from "@/types";

export const FAVORITES_LIMIT = 8;
const MIN_FEATURED = 4;

export const FAVORITES_COPY: Record<Season, { title: string; eyebrow: string | null }> = {
  [Season.Default]: { title: "Los favoritos de la tienda", eyebrow: null },
  [Season.Spooky]: { title: "Favoritos de octubre", eyebrow: "Selección de temporada" },
  [Season.Christmas]: { title: "Favoritos de Navidad", eyebrow: "Selección de Navidad" },
};

export async function loadFavorites(): Promise<Product[]> {
  const featured = await getProducts({ isFeatured: true, limit: FAVORITES_LIMIT, groupBy: "parents" });
  if (featured.products.length >= MIN_FEATURED) return featured.products.slice(0, FAVORITES_LIMIT);
  const newest = await getProducts({ limit: FAVORITES_LIMIT, groupBy: "parents" });
  const seen = new Set(featured.products.map((product) => product.id));
  return [...featured.products, ...newest.products.filter((product) => !seen.has(product.id))].slice(0, FAVORITES_LIMIT);
}

export function FavoritesGrid({ products, season = Season.Default }: { products: Product[]; season?: Season }) {
  if (products.length === 0) return null;
  const copy = FAVORITES_COPY[season];
  const SeasonIcon = season === Season.Spooky ? Ghost : season === Season.Christmas ? Snowflake : null;
  const more = (
    <Link
      href={STOREFRONT_ROUTES.shop}
      className="inline-flex h-11 items-center justify-center rounded-full border-2 border-blue-yankees px-5 font-sans text-sm font-semibold text-blue-yankees transition-colors hover:bg-blue-yankees hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
    >
      Ver más productos
    </Link>
  );

  return (
    <section aria-labelledby="favorites-title" className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <SectionHeading
        id="favorites-title"
        title={copy.title}
        eyebrow={
          copy.eyebrow && SeasonIcon ? (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-kawaii-lavender-light px-3 py-1 font-sans text-xs font-bold text-blue-yankees">
              <SeasonIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {copy.eyebrow}
              {season === Season.Spooky ? <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-orange-400" /> : <Gift aria-hidden="true" className="h-3.5 w-3.5 text-red-400" />}
            </span>
          ) : null
        }
        action={<div className="hidden sm:block">{more}</div>}
      />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" />
        ))}
      </div>
      <div className="sm:hidden">{more}</div>
    </section>
  );
}
