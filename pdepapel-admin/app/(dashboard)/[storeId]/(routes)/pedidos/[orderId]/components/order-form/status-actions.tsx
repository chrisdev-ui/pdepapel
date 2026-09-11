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
import { RadioCards } from "@/components/ui/radio-cards";
import {
  getStatusActions,
  ONLINE_METHODS,
  ORDER_STATUS_LABELS,
  type StatusAction,
} from "@/lib/order-transitions";
import { ORDER_ACTION_EVENT, type OrderActionEventDetail } from "@/lib/order-actions";
import { currencyFormatter } from "@/lib/utils";
import {
  OrderStatus,
  OrderType,
  PaymentMethod,
  ShippingProvider,
} from "@prisma/client";
import { useEffect, useState } from "react";

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
export function StatusActions({
  status,
  type,
  paymentMethod,
  shippingProvider,
  trackingCode,
  transactionId,
  guideRate = null,
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

  const needsReference =
    pending?.confirm === "pay" && paymentMethod === PaymentMethod.BankTransfer;
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

  // La cabecera («Siguiente paso») pide abrir una acción concreta; solo la
  // tarjeta de estado responde, para no abrir dos diálogos.
  useEffect(() => {
    if (variant !== "card") return;
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<OrderActionEventDetail>).detail;
      const action = actions.find((item) => item.confirm === detail?.action);
      if (action && !loading && !submitting) void run(action);
    };
    window.addEventListener(ORDER_ACTION_EVENT, onRequest);
    return () => window.removeEventListener(ORDER_ACTION_EVENT, onRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, loading, submitting, status, type, paymentMethod, transactionId]);

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
    return [
      status === OrderStatus.PAID || status === OrderStatus.SENT
        ? "El inventario vuelve con un movimiento de cancelación."
        : "No se toca el inventario: nunca se descontó.",
      "Si tenía cupón, se libera para que el cliente lo use otra vez.",
      "El cliente recibe un correo de cancelación.",
    ];
  })();

  return (
    <>
      <div
        className={
          variant === "care" ? "flex flex-wrap gap-2" : "flex flex-col gap-2"
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
            size={variant === "care" ? "sm" : "default"}
            disabled={loading || submitting}
            onClick={() => run(action)}
            className={
              action.destructive
                ? "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                : "justify-start"
            }
          >
            {action.label}
          </Button>
        ))}
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => !open && !submitting && setPending(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pending?.label}</DialogTitle>
            <DialogDescription>
              El pedido pasará de «{ORDER_STATUS_LABELS[status]}» a «
              {pending ? ORDER_STATUS_LABELS[pending.to] : ""}».
              {pending?.confirm === "pay" && paymentMethod
                ? ` Método: ${METHOD_LABEL[paymentMethod] ?? paymentMethod}.`
                : ""}
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
                {needsReference
                  ? "Referencia de la transferencia"
                  : "Referencia del pago"}
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
                  Revisa el comprobante del cliente antes de confirmar. La
                  referencia queda en el pedido.
                </p>
              )}
            </div>
          )}
          {asksGuide && guideRate && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">Guía de EnvioClick</p>
              <RadioCards<"now" | "later">
                value={guideChoice}
                onChange={setGuideChoice}
                label="Guía de EnvioClick"
                idPrefix="guia"
                columns={1}
                options={[
                  {
                    value: "now",
                    title: "Crear la guía ahora",
                    hint: `${guideRate.carrier} · ${currencyFormatter(guideRate.cost)}`,
                    bullets: [
                      "Se cobra a EnvioClick y no se deshace desde aquí; si hace falta, tendrás que cancelar el envío.",
                    ],
                  },
                  {
                    value: "later",
                    title: "Todavía no",
                    hint: "Podrás crearla después desde «Envío y empaque». Las tarifas valen 2 horas.",
                  },
                ]}
              />
            </div>
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
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPending(null)}
              disabled={submitting}
            >
              Volver
            </Button>
            <Button
              type="button"
              variant={pending?.destructive ? "destructive" : "default"}
              onClick={confirm}
              disabled={
                submitting ||
                (needsReference && reference.trim().length < 4) ||
                (needsGuide && guide.trim().length === 0)
              }
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
