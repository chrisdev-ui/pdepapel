"use client";

import { CalendarClock, Check, CreditCard, Flame, Gift, PackageX, ShieldCheck, Truck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FreeShippingProgress } from "@/components/free-shipping-progress";
import { NotifyMeForm } from "@/components/notify-me-form";
import { useCart } from "@/hooks/use-cart";
import { ProductAvailability } from "@/lib/product-availability";
import { formatArrivalDate } from "@/lib/product-card";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { blindBoxFloor, isBlindBox } from "@/lib/blind-box";
import { calculateTotals, cn, effectiveUnitPrice } from "@/lib/utils";
import { useStorefrontSettings } from "@/providers/storefront-settings-provider";
import { Product } from "@/types";

interface ProductSignalsProps {
  product: Product;
  availability: ProductAvailability;
  quantity: number;
  className?: string;
}

const TONES = {
  green: { bg: "bg-kawaii-mint-light/60", text: "text-green-700", Icon: Check },
  amber: { bg: "bg-kawaii-yellow-light/70", text: "text-amber-800", Icon: Flame },
  gray: { bg: "bg-gray-100", text: "text-gray-700", Icon: PackageX },
  purple: { bg: "bg-kawaii-lavender-light/60", text: "text-purple-800", Icon: CalendarClock },
  /** Preventa: se puede comprar, a diferencia de «llega pronto». */
  blue: { bg: "bg-blue-baby/30", text: "text-blue-800", Icon: CalendarClock },
} as const;

/**
 * Señales junto al botón, siempre en el mismo orden: stock real, entrega,
 * progreso a envío gratis, «avísame» cuando no se puede comprar, pago y
 * cambios. Nada se inventa: la ventana de entrega y los cambios salen de las
 * políticas publicadas y el umbral de envío gratis de la configuración.
 */
export function ProductSignals({ product, availability, quantity, className }: ProductSignalsProps) {
  const items = useCart((state) => state.items);
  const { freeShippingThreshold, deliveryEstimate } = useStorefrontSettings();
  const tone = TONES[availability.tone];

  // El carrito vive en el navegador: en el servidor no existe. Si se usara
  // igual, el servidor pintaría «te faltan X» contando un carrito vacío —más
  // de lo que de verdad falta— y React encima se quejaría al hidratar.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const inCart = items.some((item) => item.id === product.id);
  const projectedSubtotal = isMounted
    ? calculateTotals(items, null).subtotal +
      (inCart || !availability.canBuy
        ? 0
        : effectiveUnitPrice({ ...product, quantity }) * quantity)
    : 0;

  return (
    <div className={cn("flex flex-col gap-2.5 rounded-xl px-4 py-3.5 font-sans text-sm text-blue-yankees", tone.bg, className)}>
      <p role="status" className={cn("flex items-center gap-2 font-semibold", tone.text)}>
        <tone.Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>{availability.stockLabel}</span>
      </p>
      {isBlindBox(product) && (
        <p className="flex items-start gap-2">
          <Gift aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>No se puede escoger qué viene adentro.</strong> Llevas{" "}
            {blindBoxFloor(quantity)}: el contenido es al azar y puede repetirse
            entre cápsulas.
          </span>
        </p>
      )}
      {availability.status === "presale" && availability.presale && (
        <>
          <p className="flex items-center gap-2">
            <Truck aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>
              Pagas el total hoy y lo despachamos el{" "}
              <strong>{availability.presale.arrivalLabel}</strong>.
            </span>
          </p>
          <p className="flex items-center gap-2">
            <Flame aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>
              Quedan <strong>{availability.presale.remaining}</strong> reservas.
            </span>
          </p>
          <p className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>
              Si la fecha cambia te avisamos y puedes pedir tu dinero de vuelta.
            </span>
          </p>
        </>
      )}
      {availability.canBuy && availability.status !== "presale" && (
        <>
          <p className="flex items-center gap-2">
            <Truck aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>
              {deliveryEstimate ? (
                <>
                  Llega en <strong>{deliveryEstimate}</strong> a toda Colombia
                </>
              ) : (
                <>Enviamos a toda Colombia</>
              )}{" "}
              ·{" "}
              <Link href={STOREFRONT_ROUTES.shippingPolicy} className="underline underline-offset-2">
                ver envíos
              </Link>
            </span>
          </p>
          <FreeShippingProgress
            subtotal={projectedSubtotal}
            threshold={freeShippingThreshold}
            pending={!isMounted}
          />
        </>
      )}
      {!availability.canBuy && availability.status !== "archived" && (
        <NotifyMeForm
          productId={product.id}
          variant={availability.status === "coming-soon" ? "coming-soon" : "sold-out"}
          arrivalLabel={availability.status === "coming-soon" && product.availableAt ? `Llega el ${formatArrivalDate(product.availableAt)}` : null}
          className="bg-white/70"
          open
          showHeadline={false}
        />
      )}
      <p className="flex items-center gap-2">
        <CreditCard aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>Pago en línea o transferencia bancaria</span>
      </p>
      <p className="flex items-center gap-2">
        <Undo2 aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>
          Cambios hasta 5 días después de la compra ·{" "}
          <Link href={STOREFRONT_ROUTES.returnsPolicy} className="underline underline-offset-2">
            ver condiciones
          </Link>
        </span>
      </p>
    </div>
  );
}
