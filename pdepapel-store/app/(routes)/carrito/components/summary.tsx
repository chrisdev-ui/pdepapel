"use client";

import { Check, CreditCard, ShieldCheck, TicketPercent, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AccountPrompt } from "@/components/account-prompt";
import { FreeShippingProgress } from "@/components/free-shipping-progress";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import { useCouponMinimumGuard } from "@/hooks/use-coupon-minimum-guard";
import { toast } from "@/hooks/use-toast";
import useValidateCoupon from "@/hooks/use-validate-coupon";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { calculateTotals, cn, currencyFormatter } from "@/lib/utils";
import { useStorefrontSettings } from "@/providers/storefront-settings-provider";

interface SummaryProps {
  /** Motivo por el que no se puede continuar; null cuando todo está bien. */
  disabledReason?: string | null;
}

const ROW = "flex items-center justify-between gap-3 font-sans text-sm text-blue-yankees";

/**
 * Resumen del pedido: progreso a envío gratis, subtotal, ahorros, cupón,
 * envío (se calcula en el checkout con la dirección) y total. El cupón
 * validado aquí llega al checkout por el mismo estado que ya usa.
 */
export const Summary: React.FC<SummaryProps> = ({ disabledReason = null }) => {
  const router = useRouter();
  const items = useCart((state) => state.items);
  const { freeShippingThreshold } = useStorefrontSettings();
  const couponState = useCheckoutStore((state) => state.couponState);
  const setCouponState = useCheckoutStore((state) => state.setCouponState);
  const [code, setCode] = useState("");
  const [showCoupon, setShowCoupon] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const coupon = couponState.isValid ? couponState.coupon : null;

  const { total, subtotal, productSavings, couponDiscount, freeShipping } = useMemo(
    () => calculateTotals(items, coupon, 0, freeShippingThreshold),
    [items, coupon, freeShippingThreshold],
  );
  const count = items.reduce((sum, item) => sum + Number(item.quantity ?? 1), 0);

  // Si el carrito baja de la compra mínima, el cupón se quita con aviso en vez
  // de quedarse «aplicado» con $ 0 hasta que el checkout lo rechace.
  const dropCouponBelowMinimum = useCallback(
    (dropped: { code: string; minOrderValue: number | null }) => {
      setCouponState({ coupon: null, isValid: null });
      toast({ description: `Quitamos el cupón ${dropped.code}: pide una compra mínima de ${currencyFormatter.format(Number(dropped.minOrderValue ?? 0))}.`, variant: "warning" });
    },
    [setCouponState],
  );
  useCouponMinimumGuard(coupon, subtotal, dropCouponBelowMinimum);
  const disabled = items.length === 0 || Boolean(disabledReason);

  const { mutate: validate, status } = useValidateCoupon({
    onSuccess: (data) => {
      if (!data) {
        setCouponState({ coupon: null, isValid: false });
        toast({ description: "Ese cupón no es válido o ya no está activo.", variant: "warning" });
        return;
      }
      setCouponState({ coupon: data, isValid: true });
      setCode("");
      setShowCoupon(false);
      toast({ description: `Cupón ${data.code} aplicado.`, variant: "success" });
    },
    onError: () => toast({ description: "No pudimos validar el cupón. Inténtalo de nuevo.", variant: "destructive" }),
  });

  useEffect(() => {
    const target = ctaRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setStickyVisible(!entry.isIntersecting), { threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const goToCheckout = () => router.push(STOREFRONT_ROUTES.checkout);
  const applyCoupon = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    validate({ code: trimmed, subtotal });
  };

  return (
    <aside aria-labelledby="resumen-titulo" className="mt-10 flex flex-col gap-4 rounded-2xl bg-blue-baby/20 p-5 sm:p-6 lg:sticky lg:top-[calc(var(--storefront-header-offset)+1rem)] lg:mt-0 lg:p-7">
      <h2 id="resumen-titulo" className="font-serif text-xl font-bold text-blue-yankees">
        Resumen del pedido
      </h2>
      <FreeShippingProgress subtotal={subtotal} threshold={freeShippingThreshold} />
      <dl className="flex flex-col gap-2.5">
        <div className={ROW}>
          <dt>
            Subtotal ({count} {count === 1 ? "producto" : "productos"})
          </dt>
          <dd className="font-quicksand font-semibold">{currencyFormatter.format(subtotal)}</dd>
        </div>
        {productSavings > 0 && (
          <div className={cn(ROW, "text-green-700")}>
            <dt>Ahorros en ofertas</dt>
            <dd className="font-quicksand font-semibold">− {currencyFormatter.format(productSavings)}</dd>
          </div>
        )}
        {coupon && (
          <div className={cn(ROW, "text-green-700")}>
            <dt className="inline-flex items-center gap-2">
              Cupón {coupon.code}
              <button type="button" onClick={() => setCouponState({ coupon: null, isValid: null })} aria-label={`Quitar cupón ${coupon.code}`} className="inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-white">
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </dt>
            <dd className="font-quicksand font-semibold">− {currencyFormatter.format(couponDiscount)}</dd>
          </div>
        )}
        <div className={ROW}>
          <dt>Envío</dt>
          <dd className={cn("font-sans text-xs", freeShipping ? "font-bold text-green-700" : "text-gray-500")}>{freeShipping ? "Gratis" : "Se calcula con tu dirección"}</dd>
        </div>
      </dl>

      {!coupon && (
        <div className="rounded-xl border border-border bg-white p-3">
          {showCoupon ? (
            <form onSubmit={applyCoupon} className="flex gap-2">
              <label htmlFor="cart-coupon" className="sr-only">
                Código del cupón
              </label>
              <input
                id="cart-coupon"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="Escribe tu código"
                autoComplete="off"
                autoFocus
                className="h-10 min-w-0 flex-1 rounded-lg border border-border px-3 font-sans text-sm uppercase text-blue-yankees focus:outline-none focus:ring-2 focus:ring-blue-yankees"
              />
              <Button type="submit" disabled={status === "pending" || !code.trim()} className="h-10 rounded-full bg-blue-yankees px-4 font-sans text-sm font-semibold">
                {status === "pending" ? "Validando…" : "Aplicar"}
              </Button>
            </form>
          ) : (
            <button type="button" onClick={() => setShowCoupon(true)} className="flex w-full items-center justify-between gap-3 text-left font-sans text-sm text-gray-600">
              <span className="inline-flex items-center gap-2">
                <TicketPercent aria-hidden="true" className="h-4 w-4" /> ¿Tienes un cupón?
              </span>
              <span className="font-semibold text-blue-yankees underline underline-offset-4">Agregar</span>
            </button>
          )}
        </div>
      )}

      <div className="h-px bg-blue-yankees/10" />
      <div className="flex items-baseline justify-between" aria-live="polite">
        <span className="font-sans text-lg font-bold text-blue-yankees">Total</span>
        <span className="font-quicksand text-[28px] font-bold text-blue-yankees">{currencyFormatter.format(total)}</span>
      </div>
      <p className="-mt-2 font-sans text-xs text-gray-500">{freeShipping ? "Envío gratis incluido" : "Sin envío"} · IVA incluido</p>

      {disabledReason && (
        <p role="alert" className="rounded-lg bg-white px-3 py-2 font-sans text-xs font-semibold text-amber-800">
          {disabledReason}
        </p>
      )}
      <Button ref={ctaRef} onClick={goToCheckout} disabled={disabled} className="h-[52px] w-full rounded-full bg-blue-yankees font-sans text-base font-semibold text-white hover:bg-blue-yankees/90 disabled:cursor-not-allowed disabled:opacity-50">
        <CreditCard aria-hidden="true" className="mr-2 h-5 w-5" />
        Finalizar compra
      </Button>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 font-sans text-xs font-semibold text-purple-950">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" /> Compra segura
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Check aria-hidden="true" className="h-3.5 w-3.5 text-purple-600" /> Pago en línea o transferencia
        </span>
      </div>
      <AccountPrompt source="cart_page" redirectPath={STOREFRONT_ROUTES.cart} />

      <div
        aria-hidden={!stickyVisible}
        className={cn(
          "fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 right-[5.25rem] z-40 transition-all duration-200 motion-reduce:transition-none lg:hidden",
          stickyVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <div className="flex h-14 items-center gap-3 rounded-full bg-white pl-4 pr-1.5 shadow-[0_8px_24px_rgba(34,27,65,0.22)] ring-1 ring-blue-baby">
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="font-sans text-xs text-gray-500">Total</span>
            <span className="font-quicksand text-[15px] font-bold text-blue-yankees">{currencyFormatter.format(total)}</span>
          </span>
          <Button onClick={goToCheckout} disabled={disabled} tabIndex={stickyVisible ? 0 : -1} className="ml-auto h-11 rounded-full bg-blue-yankees px-5 font-sans text-sm font-semibold text-white">
            Finalizar compra
          </Button>
        </div>
      </div>
    </aside>
  );
};
