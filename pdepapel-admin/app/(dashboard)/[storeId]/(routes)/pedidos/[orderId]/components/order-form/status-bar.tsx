"use client";

import type {
  OrderStatus,
  OrderType,
  PaymentMethod,
  ShippingProvider,
} from "@prisma/client";
import { Check, Clock } from "lucide-react";

import { TintBadge } from "@/components/ui/tint-badge";
import type { NextStepCard, TimelineStep } from "@/lib/order-timeline";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONE,
} from "@/lib/order-transitions";
import { cn } from "@/lib/utils";
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
  hasGuide?: boolean;
  /** Qué toca ahora, calculado en el servidor con `getNextStepCard`. */
  nextStep?: NextStepCard | null;
  /** Línea de tiempo del pedido, calculada en el servidor con `buildOrderTimeline`. */
  steps?: TimelineStep[];
  loading: boolean;
  onTransition: (payload: TransitionPayload) => Promise<void> | void;
}

/**
 * El estado del pedido en un solo sitio: dónde va, qué toca ahora y las
 * acciones que lo mueven. Antes la línea de tiempo vivía en la cabecera y las
 * acciones se repetían en Pago y en la zona de cuidado.
 */
export function OrderStatusBar({
  status,
  type,
  paymentMethod,
  shippingProvider,
  trackingCode,
  transactionId,
  guideRate = null,
  hasGuide = false,
  nextStep = null,
  steps = [],
  loading,
  onTransition,
}: OrderStatusBarProps) {
  const tone = nextStep?.tone ?? "slate";
  const shared = {
    status,
    type,
    paymentMethod,
    shippingProvider,
    trackingCode,
    transactionId,
    guideRate,
    hasGuide,
    loading,
    onTransition,
  };

  return (
    <section
      id="estado-del-pedido"
      aria-labelledby="estado-del-pedido-titulo"
      className={cn(
        "flex scroll-mt-24 flex-col gap-3 rounded-xl border p-4 sm:px-5",
        TONE_BG[tone],
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <TintBadge
              label={ORDER_STATUS_LABELS[status]}
              tone={ORDER_STATUS_TONE[status]}
            />
            <h2
              id="estado-del-pedido-titulo"
              className="text-[15px] font-bold text-primary"
            >
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
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center [&_button]:w-full sm:[&_button]:w-auto">
          <StatusActions {...shared} variant="card" />
          <StatusActions {...shared} variant="care" />
        </div>
      </div>

      {steps.length > 0 && (
        <ol
          aria-label="Línea de tiempo del pedido"
          className="flex gap-2 overflow-x-auto border-t border-primary/10 pt-3"
        >
          {steps.map((step, index) => (
            <li
              key={step.id}
              className="flex min-w-[112px] flex-1 flex-col gap-1.5"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    step.state === "done" && "bg-tint-mint text-primary",
                    step.state === "now" &&
                      "bg-primary text-primary-foreground",
                    step.state === "todo" && "bg-white/70",
                    step.state === "skipped" && "bg-white/70 opacity-50",
                  )}
                  aria-hidden="true"
                >
                  {step.state === "done" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : step.state === "now" ? (
                    <Clock className="h-3.5 w-3.5" />
                  ) : null}
                </span>
                {index < steps.length - 1 && (
                  <span
                    className={cn(
                      "h-0.5 flex-1",
                      step.state === "done" ? "bg-[#B8E8C8]" : "bg-primary/10",
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>
              <span
                className={cn(
                  "text-[13px] font-semibold",
                  step.state === "todo" || step.state === "skipped"
                    ? "text-primary/60"
                    : "text-primary",
                )}
              >
                {step.label}
                <span className="sr-only">
                  {step.state === "done"
                    ? " (hecho)"
                    : step.state === "now"
                      ? " (en curso)"
                      : ""}
                </span>
              </span>
              {step.meta && (
                <span
                  className="truncate text-xs text-primary/60"
                  title={step.meta}
                >
                  {step.meta}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
