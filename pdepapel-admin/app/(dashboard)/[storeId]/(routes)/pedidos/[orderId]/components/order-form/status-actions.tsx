"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStatusActions, ONLINE_METHODS, ORDER_STATUS_LABELS, type StatusAction } from "@/lib/order-transitions";
import { OrderStatus, OrderType, PaymentMethod, ShippingProvider } from "@prisma/client";
import { useState } from "react";

export interface TransitionPayload {
  to: OrderStatus;
  transactionId?: string;
  trackingCode?: string;
}

interface StatusActionsProps {
  status: OrderStatus;
  type: OrderType;
  paymentMethod?: PaymentMethod | null;
  shippingProvider: ShippingProvider;
  trackingCode?: string | null;
  transactionId?: string | null;
  hasEnvioClickRate: boolean;
  loading: boolean;
  /** Solo las acciones normales; las destructivas van en la zona de cuidado. */
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
 * pago, guía) y marcar pagado pide la referencia cuando es transferencia.
 */
export function StatusActions({ status, type, paymentMethod, shippingProvider, trackingCode, transactionId, hasEnvioClickRate, loading, variant, onTransition }: StatusActionsProps) {
  const [pending, setPending] = useState<StatusAction | null>(null);
  const [reference, setReference] = useState("");
  const [guide, setGuide] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const actions = getStatusActions(status, { type, paymentMethod }).filter((action) => (variant === "care" ? action.destructive : !action.destructive));
  if (actions.length === 0) return null;

  const needsReference = pending?.confirm === "pay" && paymentMethod === PaymentMethod.BankTransfer;
  const needsGuide = pending?.confirm === "ship" && shippingProvider !== ShippingProvider.NONE && !trackingCode;

  const run = async (action: StatusAction) => {
    if (action.confirm) {
      setReference(transactionId ?? "");
      setGuide("");
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

  const confirm = async () => {
    if (!pending) return;
    if (needsReference && reference.trim().length < 4) return;
    if (needsGuide && guide.trim().length === 0) return;
    setSubmitting(true);
    try {
      await onTransition({
        to: pending.to,
        transactionId: pending.confirm === "pay" ? reference.trim() || undefined : undefined,
        trackingCode: pending.confirm === "ship" ? guide.trim() || undefined : undefined,
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
          ? ["Bold o Wompi no confirmaron este pago. Solo regístralo a mano si tienes el comprobante de la pasarela; si el cliente paga después por el enlace, el pedido quedaría cobrado dos veces."]
          : []),
        "Se descuenta el inventario de cada producto y queda un movimiento en el kardex.",
        "Se fija la fecha de pago de hoy: el pedido cuenta en las ventas y en los reportes tributarios.",
        hasEnvioClickRate ? "Se te preguntará si crear la guía de EnvioClick con la cotización guardada." : "Después podrás cotizar o registrar el envío.",
        "El cliente recibe un correo de pago confirmado.",
      ];
    }
    if (pending.confirm === "ship") {
      return ["El cliente recibe el aviso de envío con la guía.", "El pedido pasa a «En camino» en la lista."];
    }
    return [
      status === OrderStatus.PAID || status === OrderStatus.SENT ? "El inventario vuelve con un movimiento de cancelación." : "No se toca el inventario: nunca se descontó.",
      "Si tenía cupón, se libera para que el cliente lo use otra vez.",
      "El cliente recibe un correo de cancelación.",
    ];
  })();

  return (
    <>
      <div className={variant === "care" ? "flex flex-wrap gap-2" : "flex flex-col gap-2"}>
        {actions.map((action) => (
          <Button
            key={action.to}
            type="button"
            variant={action.destructive ? "outline" : action.primary ? "default" : "soft"}
            size={variant === "care" ? "sm" : "default"}
            disabled={loading || submitting}
            onClick={() => run(action)}
            className={action.destructive ? "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" : "justify-start"}
          >
            {action.label}
          </Button>
        ))}
      </div>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && !submitting && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pending?.label}</DialogTitle>
            <DialogDescription>
              El pedido pasará de «{ORDER_STATUS_LABELS[status]}» a «{pending ? ORDER_STATUS_LABELS[pending.to] : ""}».
              {pending?.confirm === "pay" && paymentMethod ? ` Método: ${METHOD_LABEL[paymentMethod] ?? paymentMethod}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-primary/90">
            {consequences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {pending?.confirm === "pay" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pago-referencia">
                {needsReference ? "Referencia de la transferencia" : "Referencia del pago (opcional)"}
              </Label>
              <Input
                id="pago-referencia"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder={needsReference ? "Número del comprobante o de la transacción" : "Número de recibo, si lo hay"}
                autoFocus
              />
              {needsReference && <p className="text-xs text-muted-foreground">Revisa el comprobante del cliente antes de confirmar. La referencia queda en el pedido.</p>}
            </div>
          )}
          {needsGuide && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="envio-guia">Número de guía</Label>
              <Input id="envio-guia" value={guide} onChange={(event) => setGuide(event.target.value)} placeholder="Ej: SER123456789" autoFocus />
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPending(null)} disabled={submitting}>
              Volver
            </Button>
            <Button
              type="button"
              variant={pending?.destructive ? "destructive" : "default"}
              onClick={confirm}
              disabled={submitting || (needsReference && reference.trim().length < 4) || (needsGuide && guide.trim().length === 0)}
              isLoading={submitting}
              loadingText="Guardando…"
            >
              {pending?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
