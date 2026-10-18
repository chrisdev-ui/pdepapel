import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { STOREFRONT_ROUTES } from "@/lib/routes";

/** Marca visible sin productos activos todavía. */
export function BrandEmptyState() {
  return (
    <div role="status" className="flex flex-col items-center gap-4 rounded-2xl border-[1.5px] border-dashed border-blue-baby px-6 py-10 text-center sm:py-12">
      <ShoppingBag aria-hidden="true" className="h-12 w-12 text-gray-500" />
      <h2 className="text-balance font-serif text-2xl font-bold text-blue-yankees sm:text-3xl">Pronto tendremos productos de esta marca</h2>
      <p className="max-w-md font-sans text-[15px] text-gray-600">Mientras tanto, mira lo que ya está en la tienda.</p>
      <Link
        href={STOREFRONT_ROUTES.shop}
        prefetch={false}
        className="inline-flex h-12 items-center justify-center rounded-full bg-blue-yankees px-7 font-sans text-base font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
      >
        Ver toda la tienda
      </Link>
    </div>
  );
}
