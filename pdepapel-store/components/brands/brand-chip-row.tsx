import { ArrowRight } from "lucide-react";

import { BrandLogo } from "@/components/brands/brand-logo";
import { brandToggleHref, canShowBrandLogo, parseBrandParam } from "@/lib/brand-display";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { BrandSummary } from "@/types";

interface BrandChipRowProps {
  brands: Pick<BrandSummary, "id" | "name" | "slug" | "logoUrl" | "logoPermission">[];
  /** Los parámetros de la URL que pintó el servidor: de aquí salen el estado y los enlaces. */
  searchParams: Record<string, string | string[] | undefined>;
  basePath?: string;
  /** Cuántas marcas antes de «Ver todas». */
  limit?: number;
}

/**
 * Fila de marcas de la tienda: enlaces pintados en el servidor, sin JS. En el
 * teléfono se desliza de lado; en escritorio se acomoda en varias líneas.
 */
export function BrandChipRow({ brands, searchParams, basePath = STOREFRONT_ROUTES.shop, limit = 8 }: BrandChipRowProps) {
  if (brands.length === 0) return null;
  const selected = parseBrandParam(searchParams.marca);
  const visible = brands.filter((brand, index) => index < limit || selected.includes(brand.slug));

  return (
    <nav aria-labelledby="brand-chips-label" className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
      <span id="brand-chips-label" className="font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-blue-yankees/80 lg:text-[13px] lg:normal-case lg:tracking-normal">
        Marcas
      </span>
      <ul className="category-chips -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {visible.map((brand) => {
          const active = selected.includes(brand.slug);
          const hasLogo = canShowBrandLogo(brand);
          // El estado vive en atributos (aria-current) para que la tienda lo
          // actualice sin volver a pintar cuando las casillas cambian la marca;
          // la palomita la pinta el CSS de `.brand-chip`.
          return (
            <li key={brand.slug} className="shrink-0">
              <a
                href={brandToggleHref(basePath, searchParams, brand.slug)}
                data-brand-chip={brand.slug}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "brand-chip brand-focus",
                  hasLogo ? "pl-1.5 pr-4" : "px-4",
                )}
              >
                <BrandLogo brand={brand} width={44} height={30} sizeClassName="h-[30px] w-11" alt="" className="rounded-md" />
                {brand.name}
              </a>
            </li>
          );
        })}
        <li className="shrink-0">
          <a
            href={STOREFRONT_ROUTES.brands}
            className="brand-focus flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-blue-yankees px-4 font-sans text-sm font-semibold text-white hover:opacity-90"
          >
            Ver todas
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </a>
        </li>
      </ul>
    </nav>
  );
}
