import Link from "next/link";

import { getProducts } from "@/actions/get-products";
import { ScrollRail } from "@/components/home/scroll-rail";
import ProductCard from "@/components/ui/product-card";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { Product } from "@/types";

export const NEW_ARRIVALS_LIMIT = 12;
const NEW_ARRIVALS_HREF = `${STOREFRONT_ROUTES.shop}?sortOption=dateAdded`;

/** Se oculta si no aporta nada nuevo frente a los favoritos. */
export function pickNewArrivals(newest: Product[], favorites: Product[]): Product[] {
  const shown = new Set(favorites.map((product) => product.id));
  const fresh = newest.filter((product) => !shown.has(product.id));
  return fresh.length >= 4 ? fresh.slice(0, NEW_ARRIVALS_LIMIT) : [];
}

export async function NewArrivalsRail({ favorites }: { favorites: Product[] }) {
  const { products } = await getProducts({ onlyNew: true, limit: NEW_ARRIVALS_LIMIT + favorites.length });
  const arrivals = pickNewArrivals(products, favorites);
  if (arrivals.length === 0) return null;

  const more = (
    <Link
      href={NEW_ARRIVALS_HREF}
      className="inline-flex h-11 items-center justify-center rounded-full border-2 border-blue-yankees px-5 font-sans text-sm font-semibold text-blue-yankees transition-colors hover:bg-blue-yankees hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
    >
      Ver todas las novedades
    </Link>
  );

  return (
    <section aria-labelledby="new-arrivals-title" className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <ScrollRail
        ariaLabel="Recién llegados"
        heading={{ id: "new-arrivals-title", title: "Recién llegados", action: <div className="hidden sm:block">{more}</div> }}
      >
        {arrivals.map((product) => (
          <div key={product.id} className="w-[10.5rem] shrink-0 snap-start sm:w-52 lg:w-56 xl:w-60">
            <ProductCard product={product} isNew sizes="(max-width: 640px) 168px, 240px" />
          </div>
        ))}
      </ScrollRail>
      <div className="sm:hidden">{more}</div>
    </section>
  );
}
