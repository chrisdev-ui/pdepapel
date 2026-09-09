"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useCart } from "@/hooks/use-cart";
import { useCartSheet } from "@/hooks/use-cart-sheet";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { calculateTotals, cn, currencyFormatter } from "@/lib/utils";

/** En la ficha de producto manda la barra del propio producto. */
const HIDDEN_ON = [STOREFRONT_ROUTES.cart, STOREFRONT_ROUTES.checkout, "/producto/"];

/**
 * Barra fija del carrito en teléfonos y tabletas: aparece cuando la cabecera se
 * oculta al desplazarse y el carrito tiene productos.
 */
export function MobileCartBar() {
  const pathname = usePathname();
  const items = useCart((state) => state.items);
  const openSheet = useCartSheet((state) => state.open);
  const scrollPosition = useScrollPosition(8);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || items.length === 0) return null;
  if (HIDDEN_ON.some((route) => pathname.startsWith(route))) return null;

  const count = items.reduce((total, item) => total + Number(item.quantity ?? 1), 0);
  const { total } = calculateTotals(items, null);
  const visible = scrollPosition > 80;

  return (
    <div
      className={cn(
        "fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 right-[5.25rem] z-40 transition-all duration-200 lg:hidden",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
      aria-hidden={!visible}
    >
      <div className="flex h-14 items-center gap-3 rounded-full bg-blue-yankees pl-4 pr-1.5 text-white shadow-[0_8px_24px_rgba(34,27,65,0.28)]">
        <button
          type="button"
          onClick={() => openSheet()}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
          aria-label={`Abrir carrito, ${count} ${count === 1 ? "producto" : "productos"}`}
        >
          <span className="relative inline-flex shrink-0">
            <ShoppingBag aria-hidden="true" className="h-6 w-6" />
            <span className="absolute -right-2 -top-2 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pink-shell px-1 font-sans text-[11px] font-bold text-blue-yankees">
              {count}
            </span>
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="font-sans text-xs opacity-85">
              {count} {count === 1 ? "producto" : "productos"}
            </span>
            <span className="font-quicksand text-[15px] font-bold">{currencyFormatter.format(total)}</span>
          </span>
        </button>
        <Link
          href={STOREFRONT_ROUTES.cart}
          className="inline-flex h-11 shrink-0 items-center rounded-full bg-pink-shell px-4 font-sans text-sm font-bold text-blue-yankees"
        >
          Ir al carrito
        </Link>
      </div>
    </div>
  );
}
