
import { brandPath, STOREFRONT_ROUTES } from "@/lib/routes";
import type { BrandSummary } from "@/types";

type MenuBrand = Pick<BrandSummary, "name" | "slug">;

/** Cuántas marcas caben en el menú; el resto está en /marcas. */
export const MENU_BRANDS = 5;

/** Solo nombre y slug: el menú va en el HTML (dos veces en la carga de React) de cada página. */
export function toMenuBrands(brands: BrandSummary[]): MenuBrand[] {
  return brands.slice(0, MENU_BRANDS).map(({ name, slug }) => ({ name, slug }));
}

/** Cajón del teléfono: los nombres como enlaces del servidor, sin logos, y «Ver todas». */
export function BrandMenuTiles({ brands }: { brands: MenuBrand[] }) {
  return (
    <div className="border-b border-border bg-[#FAF8FE] px-4 py-3">
      <div className="mb-1 flex min-h-[2.75rem] items-center justify-between">
        <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Marcas</p>
        <a href={STOREFRONT_ROUTES.brands} className="flex min-h-[2.75rem] items-center font-sans text-sm font-bold text-blue-yankees underline underline-offset-4">
          Ver todas
        </a>
      </div>
      <ul className="flex flex-wrap gap-2">
        {brands.map((brand) => (
          <li key={brand.slug}>
            <a href={brandPath(brand.slug)} className="brand-menu-link brand-focus">
              {brand.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Franja del menú de escritorio: los nombres y «Ver todas». */
export function BrandMenuStrip({ brands }: { brands: MenuBrand[] }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-2.5">
      <p className="shrink-0 font-sans text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Marcas</p>
      <ul className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {brands.map((brand) => (
          <li key={brand.slug}>
            <a href={brandPath(brand.slug)} className="brand-strip-link brand-focus">
              {brand.name}
            </a>
          </li>
        ))}
        <li>
          <a href={STOREFRONT_ROUTES.brands} className="flex h-8 items-center px-2 font-sans text-[13px] font-bold text-rose-700 hover:underline">
            Ver todas
          </a>
        </li>
      </ul>
    </div>
  );
}
