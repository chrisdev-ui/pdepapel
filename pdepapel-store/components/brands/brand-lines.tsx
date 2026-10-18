import { BrandLogo } from "@/components/brands/brand-logo";
import { canShowBrandLogo } from "@/lib/brand-display";
import { brandPath } from "@/lib/routes";
import { formatProductCount } from "@/lib/shop-filters";
import { cn } from "@/lib/utils";
import type { BrandLine } from "@/types";

interface BrandLinesProps {
  brandName: string;
  lines: BrandLine[];
}

/** Líneas de la marca madre (Primavera → Flower Power) como enlaces del servidor. */
export function BrandLines({ brandName, lines }: BrandLinesProps) {
  if (lines.length === 0) return null;

  return (
    <nav
      aria-labelledby="brand-lines-label"
      className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3"
    >
      <span
        id="brand-lines-label"
        className="font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-blue-yankees/80 lg:text-[13px] lg:normal-case lg:tracking-normal"
      >
        Líneas
      </span>
      <ul
        aria-label={`Líneas de ${brandName}`}
        className="category-chips -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
      >
        {lines.map((line) => {
          const hasLogo = canShowBrandLogo(line);
          return (
            <li key={line.slug} className="shrink-0">
              <a
                href={brandPath(line.slug)}
                aria-label={`${line.name}: ${formatProductCount(line.productCount)}`}
                className={cn(
                  "brand-chip brand-focus",
                  hasLogo ? "pl-1.5 pr-4" : "px-4",
                )}
              >
                {hasLogo ? (
                  <BrandLogo
                    brand={line}
                    width={44}
                    height={30}
                    sizeClassName="h-[30px] w-11"
                    alt=""
                    className="rounded-md"
                  />
                ) : (
                  line.name
                )}
                <span className="font-normal text-blue-yankees/70">
                  {line.productCount.toLocaleString("es-CO")}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
