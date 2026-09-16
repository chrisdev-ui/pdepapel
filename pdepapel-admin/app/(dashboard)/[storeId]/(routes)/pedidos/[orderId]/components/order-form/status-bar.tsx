"use client";

import type { OrderStatus, OrderType, PaymentMethod, ShippingProvider } from "@prisma/client";

import { ORDER_STATUS_LABELS } from "@/lib/order-transitions";
import type { NextStepCard } from "@/lib/order-timeline";
import { cn } from "@/lib/utils";
import { TintBadge } from "../../../components/order-badges";
import { StatusActions, type TransitionPayload } from "./status-actions";

const TONE_BG: Record<NextStepCard["tone"], string> = {
  cream: "bg-tint-cream border-[#F3E2A0]",
  sky: "bg-tint-sky border-[#B9DDF2]",
  pink: "bg-tint-pink border-[#F5C1DA]",
  mint: "bg-tint-mint border-[#B8E8C8]",
  lavender: "bg-tint-lavender border-[#D0C4F0]",
  slate: "bg-muted border-border",
};

interface OrderStatusBarProps {
  status: OrderStatus;
  type: OrderType;
  paymentMethod?: PaymentMethod | null;
  shippingProvider: ShippingProvider;
  trackingCode?: string | null;
  transactionId?: string | null;
  guideRate?: { carrier: string; cost: number } | null;
  /** Qué toca ahora, calculado en el servidor con `getNextStepCard`. */
  nextStep?: NextStepCard | null;
  loading: boolean;
  onTransition: (payload: TransitionPayload) => Promise<void> | void;
}

/**
 * El estado del pedido y lo que se puede hacer con él, en un solo sitio.
 *
 * Antes esto hablaba por tres bocas: la tarjeta de «siguiente paso» de la
 * cabecera, los botones de la tarjeta de Pago y otra vez los mismos en la zona
 * de cuidado. Las acciones salen de `getStatusActions`, que no cambia: lo que
 * cambia es dónde viven.
 */
export function OrderStatusBar({
  status,
  type,
  paymentMethod,
  shippingProvider,
  trackingCode,
  transactionId,
  guideRate = null,
  nextStep = null,
  loading,
  onTransition,
}: OrderStatusBarProps) {
  const tone = nextStep?.tone ?? "slate";
  const shared = {
    status, type, paymentMethod, shippingProvider,
    trackingCode, transactionId, guideRate, loading, onTransition,
  };

  return (
    <section
      id="estado-del-pedido"
      aria-labelledby="estado-del-pedido-titulo"
      className={cn(
        "flex scroll-mt-24 flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        TONE_BG[tone],
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <TintBadge label={ORDER_STATUS_LABELS[status]} tone="lavender" />
          <h2 id="estado-del-pedido-titulo" className="text-[15px] font-bold text-primary">
            {nextStep?.title ?? "Sin nada pendiente"}
          </h2>
        </div>
        {nextStep?.description && (
          <p className="text-sm text-primary/90">{nextStep.description}</p>
        )}
        {nextStep?.consequence && (
          <p className="text-xs text-primary/70">{nextStep.consequence}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <StatusActions {...shared} variant="card" />
        <StatusActions {...shared} variant="care" />
      </div>
    </section>
  );
}
