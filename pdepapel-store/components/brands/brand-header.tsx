import Link from "next/link";

import { CollapsibleIntro } from "@/components/shop/collapsible-intro";
import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { brandLogoUrl } from "@/lib/brand-display";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { brandPath } from "@/lib/routes";
import { formatProductCount, tintForKey } from "@/lib/shop-filters";
import { cn } from "@/lib/utils";
import type { BrandPageData } from "@/types";

interface BrandHeaderProps {
  brand: BrandPageData;
  /** Productos que muestra el listado (tarjetas); `null` = sin productos todavía. */
  count: number | null;
  /** Subcategoría elegida (`?categoryId=`), para marcar su chip. */
  activeCategoryId?: string;
}

const CHIP =
  "flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 font-sans text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2";

/**
 * Cabecera de /marcas/[slug], toda del servidor: logo (si hay permiso), nombre,
 * texto, conteo y subcategorías como enlaces. El fondo toma el color de la
 * marca; el panel ya exige contraste 4.5:1 con el texto.
 */
export function BrandHeader({ brand, count, activeCategoryId }: BrandHeaderProps) {
  const logoUrl = brandLogoUrl(brand);
  const tint = tintForKey(brand.slug);
  const categories = count === null ? [] : brand.categories.filter((category) => category.count > 0);

  return (
    <section
      aria-labelledby="brand-title"
      className={cn("relative overflow-hidden rounded-2xl px-4 py-5 sm:px-6 lg:rounded-3xl lg:px-10 lg:py-8", !brand.color && tint.bg)}
      style={brand.color ? { backgroundColor: brand.color } : undefined}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 lg:gap-x-10">
        {logoUrl && (
          <span className="flex h-[88px] w-[104px] shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-[0_1px_2px_rgba(34,27,65,0.08)] lg:row-span-2 lg:h-[180px] lg:w-[200px] lg:rounded-3xl lg:p-4">
            <CloudinaryImage src={logoUrl} alt={brand.name} width={168} height={148} loading="lazy" className="h-full w-full object-contain" />
          </span>
        )}
        <div className={cn("flex min-w-0 flex-col gap-1.5 lg:gap-2 lg:self-end", !logoUrl && "col-span-2")}>
          <span className="font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-blue-yankees lg:text-xs">Marca original</span>
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
            <h1 id="brand-title" className="break-words font-serif text-[30px] font-bold leading-[1.05] text-blue-yankees sm:text-4xl lg:text-[44px]">
              {brand.name}
            </h1>
            <span className="inline-flex h-8 items-center rounded-full bg-white px-3 font-sans text-[13px] font-bold text-blue-yankees shadow-[0_1px_2px_rgba(34,27,65,0.08)] lg:h-9 lg:px-3.5 lg:text-sm">
              {count === null ? "Sin productos por ahora" : formatProductCount(count)}
            </span>
          </div>
        </div>
        {(brand.seoText || categories.length > 1) && (
          <div className={cn("col-span-2 flex min-w-0 flex-col gap-3 lg:self-start", logoUrl && "lg:col-span-1 lg:col-start-2")}>
            {brand.seoText && <CollapsibleIntro text={brand.seoText} />}
            {categories.length > 1 && (
              <nav aria-label={`Subcategorías de ${brand.name}`}>
                <ul className="category-chips -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
                  <li className="shrink-0">
                    <Link
                      href={brandPath(brand.slug)}
                      prefetch={false}
                      aria-current={activeCategoryId ? undefined : "page"}
                      className={cn(CHIP, activeCategoryId ? "bg-white text-blue-yankees" : "bg-blue-yankees text-white")}
                    >
                      Todo
                    </Link>
                  </li>
                  {categories.map((category) => {
                    const active = activeCategoryId === category.id;
                    return (
                      <li key={category.id} className="shrink-0">
                        <Link
                          href={`${brandPath(brand.slug)}?categoryId=${encodeURIComponent(category.id)}`}
                          prefetch={false}
                          aria-current={active ? "page" : undefined}
                          className={cn(CHIP, active ? "bg-blue-yankees text-white" : "bg-white text-blue-yankees")}
                        >
                          {stripTaxonomyIcon(category.name)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
