"use client";

import { Check, ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { CldImage } from "@/components/ui/CldImage";
import { Button } from "@/components/ui/button";
import { currencyFormatter } from "@/lib/utils";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { Product } from "@/types";

type CartPreviewSource = "product_card" | "product_detail";

type CartPreviewInput = {
  product: Product;
  quantity: number;
  source: CartPreviewSource;
};

type CartPreviewContextValue = {
  showCartPreview: (input: CartPreviewInput) => void;
};

const CartPreviewContext = createContext<CartPreviewContextValue | null>(null);
const AUTO_DISMISS_MS = 8_000;

export function CartPreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [preview, setPreview] = useState<CartPreviewInput | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setPreview(null);
  }, [clearTimer]);

  const scheduleDismiss = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
  }, [clearTimer, dismiss]);

  const showCartPreview = useCallback(
    (input: CartPreviewInput) => {
      setPreview(input);
      scheduleDismiss();
      trackCustomerEvent("cart_preview_view", { source: input.source });
    },
    [scheduleDismiss],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const image =
    preview?.product.images.find((item) => item.isMain) ??
    preview?.product.images[0];

  return (
    <CartPreviewContext.Provider value={{ showCartPreview }}>
      {children}
      {preview && (
        <aside
          aria-label="Producto agregado al carrito"
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] z-[60] max-h-[calc(100dvh-env(safe-area-inset-bottom)-7.5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-blue-baby bg-white p-4 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-32 sm:max-h-[calc(100dvh-9rem)] sm:w-[390px] lg:top-40 lg:max-h-[calc(100dvh-11rem)]"
          onMouseEnter={clearTimer}
          onMouseLeave={scheduleDismiss}
          onFocusCapture={clearTimer}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              scheduleDismiss();
            }
          }}
        >
          <p role="status" className="sr-only">
            {preview.product.name} se agregó al carrito.
          </p>
          <div className="flex items-start gap-3">
            <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-gray-100">
              {image?.url ? (
                <CldImage
                  src={image.url}
                  alt=""
                  fill
                  sizes="72px"
                  className="object-cover"
                  format="auto"
                />
              ) : (
                <ShoppingBag
                  aria-hidden="true"
                  className="absolute inset-0 m-auto h-7 w-7 text-gray-400"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                  <Check aria-hidden="true" className="h-4 w-4" />
                  Agregado al carrito
                </p>
                <button
                  type="button"
                  aria-label="Cerrar resumen del carrito"
                  className="size-9 flex shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink"
                  onClick={dismiss}
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 line-clamp-2 font-sans text-sm font-semibold leading-5">
                {preview.product.name}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Cantidad: {preview.quantity} ·{" "}
                {currencyFormatter.format(Number(preview.product.price))}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 xxs:grid-cols-2">
            <Button
              asChild
              variant="outline"
              className="h-11 w-full px-2 font-quicksand font-semibold normal-case"
            >
              <Link
                href={STOREFRONT_ROUTES.cart}
                onClick={() => {
                  trackCustomerEvent("cart_preview_action", {
                    action: "view_cart",
                    source: preview.source,
                  });
                  dismiss();
                }}
              >
                Ver carrito
              </Link>
            </Button>
            <Button
              asChild
              className="h-11 w-full px-2 font-quicksand font-semibold normal-case"
            >
              <Link
                href={STOREFRONT_ROUTES.checkout}
                onClick={() => {
                  trackCustomerEvent("cart_preview_action", {
                    action: "checkout",
                    source: preview.source,
                  });
                  dismiss();
                }}
              >
                Finalizar compra
              </Link>
            </Button>
          </div>
        </aside>
      )}
    </CartPreviewContext.Provider>
  );
}

export function useCartPreview() {
  const context = useContext(CartPreviewContext);
  if (!context) {
    throw new Error("useCartPreview debe usarse dentro de CartPreviewProvider");
  }
  return context;
}
