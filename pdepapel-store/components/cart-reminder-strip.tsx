"use client";

import { ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useCart } from "@/hooks/use-cart";
import { CART_REMINDER_DISMISSED_KEY, CART_TOUCHED_KEY, readSessionFlag, writeSessionFlag } from "@/lib/cart-session";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { calculateTotals, currencyFormatter } from "@/lib/utils";

/** Al volver con productos guardados de otra visita, una franja lo recuerda una vez por sesión. */
export function CartReminderStrip() {
  const pathname = usePathname();
  const items = useCart((state) => state.items);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (items.length === 0) {
      setVisible(false);
      return;
    }
    const show = !readSessionFlag(CART_TOUCHED_KEY) && !readSessionFlag(CART_REMINDER_DISMISSED_KEY);
    setVisible(show);
    if (show) trackCustomerEvent("cart_reminder_view", { item_count: items.length });
    // Solo al montar: si la clienta agrega algo después, la franja ya cumplió.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onHome = pathname === STOREFRONT_ROUTES.home;
  if (!visible || !onHome || items.length === 0) return null;

  const count = items.reduce((total, item) => total + Number(item.quantity ?? 1), 0);
  const { total } = calculateTotals(items, null);

  const dismiss = () => {
    writeSessionFlag(CART_REMINDER_DISMISSED_KEY);
    setVisible(false);
  };

  return (
    <div role="status" className="border-b border-pink-shell bg-kawaii-pink-light/40">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-4 py-2.5 font-sans text-sm text-blue-yankees sm:px-6 lg:justify-center lg:px-8">
        <ShoppingBag aria-hidden="true" className="h-5 w-5 shrink-0" />
        <p className="min-w-0 flex-1 lg:flex-none">
          Dejaste <strong>{count} {count === 1 ? "producto" : "productos"}</strong> en tu carrito ({currencyFormatter.format(total)}).
        </p>
        <Link
          href={STOREFRONT_ROUTES.cart}
          onClick={() => trackCustomerEvent("cart_reminder_click", { item_count: items.length })}
          className="inline-flex h-9 shrink-0 items-center rounded-full bg-blue-yankees px-4 font-bold text-white"
        >
          Continuar compra
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar recordatorio del carrito"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-blue-yankees/70 hover:bg-white/60"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
