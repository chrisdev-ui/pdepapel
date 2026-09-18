"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioCards } from "@/components/ui/radio-cards";
import {
  getStatusActions,
  isPaidLike,
  ONLINE_METHODS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONE,
  type StatusAction,
} from "@/lib/order-transitions";
import { currencyFormatter } from "@/lib/utils";
import {
  OrderStatus,
  OrderType,
  PaymentMethod,
  ShippingProvider,
} from "@prisma/client";
import { useState } from "react";

import { ConfirmDialog } from "./confirm-dialog";

export interface TransitionPayload {
  to: OrderStatus;
  transactionId?: string;
  trackingCode?: string;
  /** Solo al marcar pagado con una tarifa de EnvioClick guardada. */
  createGuide?: boolean;
}

interface StatusActionsProps {
  status: OrderStatus;
  type: OrderType;
  paymentMethod?: PaymentMethod | null;
  shippingProvider: ShippingProvider;
  trackingCode?: string | null;
  transactionId?: string | null;
  /** Tarifa de EnvioClick lista para la guía (sin guía todavía); null si no aplica. */
  guideRate?: { carrier: string; cost: number } | null;
  /** Ya existe una guía de EnvioClick: cancelar el pedido no la anula sola. */
  hasGuide?: boolean;
  loading: boolean;
  /** Solo las acciones normales; las destructivas van aparte. */
  variant: "card" | "care";
  onTransition: (payload: TransitionPayload) => Promise<void> | void;
}

const METHOD_LABEL: Partial<Record<PaymentMethod, string>> = {
  BankTransfer: "transferencia",
  CASH: "efectivo",
  COD: "contra entrega",
  Bold: "pago en línea",
  Wompi: "pago en línea",
  PayU: "pago en línea",
};

/**
 * Cambios de estado como acciones explícitas con confirmación, en lugar de un
 * selector libre: cada botón dice qué pasa al pulsarlo (inventario, fecha de
 * pago, guía) y marcar pagado pide la referencia cuando hay comprobante.
 */
export function StatusActions({
  status,
  type,
  paymentMethod,
  shippingProvider,
  trackingCode,
  transactionId,
  guideRate = null,
  hasGuide = false,
  loading,
  variant,
  onTransition,
}: StatusActionsProps) {
  const [pending, setPending] = useState<StatusAction | null>(null);
  const [reference, setReference] = useState("");
  const [guide, setGuide] = useState("");
  const [guideChoice, setGuideChoice] = useState<"now" | "later">("now");
  const [submitting, setSubmitting] = useState(false);

  const actions = getStatusActions(status, { type, paymentMethod }).filter(
    (action) => (variant === "care" ? action.destructive : !action.destructive),
  );

  // Con transferencia o pasarela hay un comprobante que citar; en efectivo o
  // contra entrega la referencia es opcional.
  const needsReference =
    pending?.confirm === "pay" &&
    (paymentMethod === PaymentMethod.BankTransfer ||
      (paymentMethod !== null &&
        paymentMethod !== undefined &&
        ONLINE_METHODS.includes(paymentMethod)));
  // Un envío manual (domiciliario, mensajería sin rastreo) puede no tener guía:
  // se pide solo cuando la transportadora la emite y aún no está registrada.
  const asksGuideNumber =
    pending?.confirm === "ship" &&
    shippingProvider !== ShippingProvider.NONE &&
    !trackingCode;
  const needsGuide =
    asksGuideNumber && shippingProvider === ShippingProvider.ENVIOCLICK;
  // La guía se decide aquí mismo, en el diálogo de pago, en lugar de un
  // segundo modal después de confirmar.
  const asksGuide = pending?.confirm === "pay" && guideRate !== null;

  const run = async (action: StatusAction) => {
    if (action.confirm) {
      setReference(transactionId ?? "");
      setGuide("");
      setGuideChoice("now");
      setPending(action);
      return;
    }
    setSubmitting(true);
    try {
      await onTransition({ to: action.to });
    } finally {
      setSubmitting(false);
    }
  };

  if (actions.length === 0) return null;

  const confirm = async () => {
    if (!pending) return;
    if (needsReference && reference.trim().length < 4) return;
    if (needsGuide && guide.trim().length === 0) return;
    setSubmitting(true);
    try {
      await onTransition({
        to: pending.to,
        transactionId:
          pending.confirm === "pay" ? reference.trim() || undefined : undefined,
        trackingCode:
          pending.confirm === "ship" ? guide.trim() || undefined : undefined,
        createGuide: asksGuide ? guideChoice === "now" : undefined,
      });
      setPending(null);
    } finally {
      setSubmitting(false);
    }
  };

  const consequences = (() => {
    if (!pending) return [] as string[];
    if (pending.confirm === "pay") {
      return [
        ...(paymentMethod && ONLINE_METHODS.includes(paymentMethod)
          ? [
              "Bold o Wompi no confirmaron este pago. Solo regístralo a mano si tienes el comprobante de la pasarela; si el cliente paga después por el enlace, el pedido quedaría cobrado dos veces.",
            ]
          : []),
        "Se descuenta el inventario de cada producto y queda un movimiento en el kardex.",
        "Se fija la fecha de pago de hoy: el pedido cuenta en las ventas y en los reportes tributarios.",
        ...(guideRate ? [] : ["Después podrás cotizar o registrar el envío."]),
        "El cliente recibe un correo de pago confirmado.",
      ];
    }
    if (pending.confirm === "ship") {
      return [
        "El cliente recibe el aviso de envío con la guía.",
        "El pedido pasa a «En camino» en la lista.",
      ];
    }
    const paid = isPaidLike(status);
    return [
      paid
        ? "El inventario vuelve con un movimiento de cancelación."
        : "No se toca el inventario: nunca se descontó.",
      ...(paid
        ? [
            "El cobro no se devuelve solo: el reembolso se gestiona aparte, con Bold o por transferencia.",
          ]
        : []),
      ...(hasGuide
        ? ["Ya hay guía: cancela el envío con la transportadora desde «Envío y empaque»."]
        : []),
      "Si tenía cupón, se libera para que el cliente lo use otra vez.",
      "El cliente recibe un correo de cancelación.",
    ];
  })();

  return (
    <>
      <div
        className={
          variant === "care" ? "flex flex-wrap gap-2" : "flex flex-wrap gap-2"
        }
      >
        {actions.map((action) => (
          <Button
            key={action.to}
            type="button"
            variant={
              action.destructive
                ? "outline"
                : action.primary
                  ? "default"
                  : "soft"
            }
            disabled={loading || submitting}
            onClick={() => run(action)}
            className={
              action.destructive
                ? "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                : undefined
            }
          >
            {action.label}
          </Button>
        ))}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.label ?? ""}
        from={{
          label: ORDER_STATUS_LABELS[status],
          tone: ORDER_STATUS_TONE[status],
        }}
        to={
          pending
            ? {
                label: ORDER_STATUS_LABELS[pending.to],
                tone: ORDER_STATUS_TONE[pending.to],
              }
            : undefined
        }
        meta={
          pending?.confirm === "pay" && paymentMethod
            ? `Método: ${METHOD_LABEL[paymentMethod] ?? paymentMethod}`
            : undefined
        }
        consequences={consequences}
        footnote={
          pending?.confirm === "cancel"
            ? "Se puede reactivar después como pendiente."
            : undefined
        }
        confirmLabel={pending ? `Sí, ${pending.label.toLowerCase()}` : ""}
        destructive={Boolean(pending?.destructive)}
        disabled={
          (needsReference && reference.trim().length < 4) ||
          (needsGuide && guide.trim().length === 0)
        }
        loading={submitting}
        onConfirm={confirm}
      >
        {pending?.confirm === "pay" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pago-referencia">
              {needsReference
                ? paymentMethod === PaymentMethod.BankTransfer
                  ? "Referencia de la transferencia"
                  : "Referencia de la pasarela"
                : "Referencia del pago (opcional)"}
            </Label>
            <Input
              id="pago-referencia"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder={
                needsReference
                  ? "Número del comprobante o de la transacción"
                  : "Número de recibo, si lo hay"
              }
              autoFocus
            />
            {needsReference && (
              <p className="text-xs text-muted-foreground">
                Revisa el comprobante antes de confirmar. La referencia queda en
                el pedido.
              </p>
            )}
          </div>
        )}
        {asksGuide && guideRate && (
          <RadioCards<"now" | "later">
            value={guideChoice}
            onChange={setGuideChoice}
            label="Guía de EnvioClick"
            idPrefix="guia"
            columns={1}
            options={[
              {
                value: "now",
                title: `Crear la guía ahora · ${guideRate.carrier} · ${currencyFormatter(guideRate.cost)}`,
                hint: "Se cobra a EnvioClick y no se deshace desde aquí.",
              },
              {
                value: "later",
                title: "Todavía no",
                hint: "La creas después desde «Envío y empaque». La tarifa vale 2 horas.",
              },
            ]}
          />
        )}
        {asksGuideNumber && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="envio-guia">
              {needsGuide ? "Número de guía" : "Número de guía (opcional)"}
            </Label>
            <Input
              id="envio-guia"
              value={guide}
              onChange={(event) => setGuide(event.target.value)}
              placeholder="Ej: SER123456789"
              autoFocus
            />
            {!needsGuide && (
              <p className="text-xs text-muted-foreground">
                Si va con domiciliario o sin rastreo, déjalo vacío: el envío
                queda «En camino» igual.
              </p>
            )}
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
