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
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { cn, currencyFormatter } from "@/lib/utils";
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

type CartPreviewPresentation = "full" | "compact";

type CartPreviewState = CartPreviewInput & {
  presentation: CartPreviewPresentation;
};

type CartPreviewDismissReason = "action" | "auto" | "manual";

const CartPreviewContext = createContext<CartPreviewContextValue | null>(null);
const AUTO_DISMISS_MS = 8_000;
const RAPID_ADD_WINDOW_MS = 20_000;
const MOBILE_VIEWPORT_QUERY = "(max-width: 639px)";

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
  }
  return window.innerWidth < 640;
}

export function CartPreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [preview, setPreview] = useState<CartPreviewState | null>(null);
  const previewRef = useRef<CartPreviewState | null>(null);
  const lastShownAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const dismiss = useCallback(
    (reason: CartPreviewDismissReason) => {
      const currentPreview = previewRef.current;
      clearTimer();
      previewRef.current = null;
      setPreview(null);

      if (currentPreview && reason !== "action") {
        trackCustomerEvent("cart_preview_dismiss", {
          presentation: currentPreview.presentation,
          reason,
          source: currentPreview.source,
        });
      }
    },
    [clearTimer],
  );

  const scheduleDismiss = useCallback(() => {
    if (!previewRef.current) return;
    clearTimer();
    timerRef.current = setTimeout(() => dismiss("auto"), AUTO_DISMISS_MS);
  }, [clearTimer, dismiss]);

  const showCartPreview = useCallback(
    (input: CartPreviewInput) => {
      const now = Date.now();
      const elapsedSinceLastPreview =
        lastShownAtRef.current === null ? null : now - lastShownAtRef.current;
      const presentation: CartPreviewPresentation =
        isMobileViewport() &&
        elapsedSinceLastPreview !== null &&
        elapsedSinceLastPreview >= 0 &&
        elapsedSinceLastPreview <= RAPID_ADD_WINDOW_MS
          ? "compact"
          : "full";
      const nextPreview = { ...input, presentation };

      lastShownAtRef.current = now;
      previewRef.current = nextPreview;
      setPreview(nextPreview);
      scheduleDismiss();
      trackCustomerEvent("cart_preview_view", {
        presentation,
        source: input.source,
      });
    },
    [scheduleDismiss],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const handleAction = useCallback(
    (action: "checkout" | "view_cart") => {
      const currentPreview = previewRef.current;
      if (!currentPreview) return;

      trackCustomerEvent("cart_preview_action", {
        action,
        presentation: currentPreview.presentation,
        source: currentPreview.source,
      });
      dismiss("action");
    },
    [dismiss],
  );

  const image =
    preview?.product.images.find((item) => item.isMain) ??
    preview?.product.images[0];

  return (
    <CartPreviewContext.Provider value={{ showCartPreview }}>
      {children}
      {preview && (
        <aside
          aria-label="Producto agregado al carrito"
          data-presentation={preview.presentation}
          className={cn(
            "fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] z-[60] max-h-[calc(100dvh-env(safe-area-inset-bottom)-7.5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-blue-baby bg-white shadow-2xl sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-32 sm:max-h-[calc(100dvh-9rem)] sm:w-[390px] sm:p-4 lg:top-40 lg:max-h-[calc(100dvh-11rem)]",
            preview.presentation === "compact" ? "p-3" : "p-4",
          )}
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
          {preview.presentation === "compact" ? (
            <div className="flex items-start gap-2">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <Check aria-hidden="true" className="h-5 w-5" />
              </div>
              <Link
                href={STOREFRONT_ROUTES.cart}
                className="group min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
                onClick={() => handleAction("view_cart")}
              >
                <p className="text-sm font-semibold text-emerald-700">
                  Agregado al carrito
                </p>
                <p className="line-clamp-1 font-sans text-sm font-semibold leading-5">
                  {preview.product.name}
                </p>
                <p className="mt-0.5 text-xs text-gray-600">
                  Cantidad: {preview.quantity} ·{" "}
                  <span className="font-semibold text-blue-yankees underline decoration-blue-purple/60 underline-offset-2 group-hover:decoration-blue-yankees">
                    Ver carrito
                  </span>
                </p>
              </Link>
              <button
                type="button"
                aria-label="Cerrar resumen del carrito"
                className="min-h-11 min-w-11 flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink"
                onClick={() => dismiss("manual")}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
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
                      className="min-h-11 min-w-11 flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink"
                      onClick={() => dismiss("manual")}
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
                  className="h-11 w-full touch-manipulation px-2 font-quicksand font-semibold normal-case"
                >
                  <Link
                    href={STOREFRONT_ROUTES.cart}
                    onClick={() => handleAction("view_cart")}
                  >
                    Ver carrito
                  </Link>
                </Button>
                <Button
                  asChild
                  className="h-11 w-full touch-manipulation px-2 font-quicksand font-semibold normal-case"
                >
                  <Link
                    href={STOREFRONT_ROUTES.checkout}
                    onClick={() => handleAction("checkout")}
                  >
                    Finalizar compra
                  </Link>
                </Button>
              </div>
            </>
          )}
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
