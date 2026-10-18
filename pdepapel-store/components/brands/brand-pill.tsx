import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { BrandLogo } from "@/components/brands/brand-logo";
import { canShowBrandLogo } from "@/lib/brand-display";
import { brandPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { PublicBrand } from "@/types";

/** «Original Kiut ›» junto al título de la ficha. Solo para marcas públicas; lo decide quien lo pinta. */
export function BrandPill({ brand }: { brand: PublicBrand }) {
  const hasLogo = canShowBrandLogo(brand);
  return (
    <Link
      href={brandPath(brand.slug)}
      prefetch={false}
      className={cn(
        "inline-flex h-11 w-fit max-w-full items-center gap-2.5 rounded-full border-[1.5px] border-blue-baby bg-white pr-3 font-sans text-sm font-semibold text-blue-yankees transition-colors hover:border-blue-yankees/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2",
        hasLogo ? "pl-1.5" : "pl-4",
      )}
    >
      <BrandLogo brand={brand} width={44} height={30} sizeClassName="h-[30px] w-11" alt="" className="rounded-md" />
      <span className="truncate">Original {brand.name}</span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
    </Link>
  );
}
