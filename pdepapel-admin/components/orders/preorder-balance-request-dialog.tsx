"use client";

import axios from "axios";
import { Copy, Link2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useClipboard } from "@/hooks/use-clipboard";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { balanceWhatsAppMessage, customerOrderUrl } from "@/lib/preorder-balance-copy";
import { currencyFormatter } from "@/lib/utils";

export interface BalanceRequestOrder {
  id: string;
  orderNumber: string;
  fullName: string;
  productName: string;
  email?: string | null;
  pickup: boolean;
  shippingCost: number;
  /** Lo que falta hoy (total − lo recibido); con el saldo pedido ya trae el envío. */
  balanceDue: number;
  balanceRequested: boolean;
}

/**
 * «Pedir saldo» y «Cobrar saldo» de una preventa que ya llegó. Pedir: Paula
 * escribe el envío cotizado (recoger en la tienda = 0) y, con «Avisar a la
 * clienta», sale el correo «Ya llegó». Cobrar: el saldo exacto y el enlace a
 * `/pedido` para mandarlo por WhatsApp, donde la clienta paga en línea o ve
 * los datos de la transferencia.
 */
export function PreorderBalanceRequestDialog({
  storeId,
  order,
  open,
  onOpenChange,
  initialView,
  onDone,
}: {
  storeId: string;
  order: BalanceRequestOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialView: "request" | "collect";
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const { onCopy } = useClipboard();
  const hasEmail = Boolean(order.email?.trim());
  const [view, setView] = useState(initialView);
  const [shippingCost, setShippingCost] = useState<number | undefined>(order.pickup ? 0 : order.balanceRequested ? order.shippingCost : undefined);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [saving, setSaving] = useState(false);
  const due = order.balanceDue;

  const previousShipping = order.balanceRequested ? order.shippingCost : 0;
  const preview = Math.max(0, order.balanceDue - previousShipping + (shippingCost ?? 0));
  const link = customerOrderUrl(order.id);
  const message = balanceWhatsAppMessage({ fullName: order.fullName, productName: order.productName, amount: due, link, pickup: order.pickup });

  const submit = async () => {
    try {
      setSaving(true);
      const { data } = await axios.post<{ amountDue: number; completed?: boolean }>(`/api/${storeId}/orders/${order.id}/balance-request`, {
        shippingCost: order.pickup ? 0 : shippingCost ?? 0,
        notifyCustomer: hasEmail && notifyCustomer,
      });
      if (data.completed) {
        toast({ title: "Pedido pagado", description: "Ya estaba todo pagado y no hay envío que cobrar: el pedido pasó a pagado.", variant: "success" });
        onOpenChange(false);
        onDone?.();
        return;
      }
      // La página se recarga y el botón pasa a «Cobrar saldo · $…», que tiene el enlace.
      toast({
        title: `Saldo pedido: ${currencyFormatter(data.amountDue)}`,
        description: !hasEmail
          ? "No tiene correo: en «Cobrar saldo» copias el enlace para WhatsApp."
          : notifyCustomer
            ? "La clienta recibe el correo «Ya llegó» con el enlace para pagar."
            : "Sin avisar a la clienta: en «Cobrar saldo» copias el enlace para WhatsApp.",
        variant: "success",
      });
      onOpenChange(false);
      onDone?.();
    } catch (error) {
      toast({ title: "No se pudo pedir el saldo", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {view === "request" ? (
          <>
            <DialogHeader>
              <DialogTitle>Pedir saldo</DialogTitle>
              <DialogDescription>
                {`Pon el envío del pedido #${order.orderNumber}. Se suma al total y desde ahí la clienta paga el saldo en su pedido, en línea o por transferencia.`}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              {order.pickup ? (
                <p className="rounded-md bg-muted p-3 text-sm">Recoge en la tienda: el envío es $ 0.</p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="balance-request-shipping">Envío cotizado</Label>
                  <CurrencyInput id="balance-request-shipping" className="h-11" value={shippingCost} onChange={setShippingCost} />
                </div>
              )}
              <p className="rounded-md bg-muted p-3 text-sm" data-testid="balance-request-preview">
                Saldo que paga la clienta: <strong>{currencyFormatter(preview)}</strong>
              </p>
              <label className={hasEmail ? "flex min-h-11 items-center gap-2 text-sm" : "flex min-h-11 items-center gap-2 text-sm text-muted-foreground"}>
                <Checkbox
                  checked={hasEmail && notifyCustomer}
                  disabled={!hasEmail}
                  onCheckedChange={(checked) => setNotifyCustomer(checked === true)}
                  aria-label="Avisar a la clienta"
                  aria-describedby={hasEmail ? undefined : "balance-request-no-email"}
                />
                {hasEmail ? "Avisar a la clienta por correo («Ya llegó: paga tu saldo»)" : <span id="balance-request-no-email">Sin correo: mándale el enlace por WhatsApp</span>}
              </label>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="button" className="min-h-11" disabled={saving || (!order.pickup && shippingCost === undefined)} onClick={submit}>
                Pedir saldo
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Cobrar saldo</DialogTitle>
              <DialogDescription>{`Pedido #${order.orderNumber}. La clienta paga desde su pedido, en línea o por transferencia.`}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <p className="rounded-md bg-muted p-3 text-base" data-testid="balance-collect-amount">
                Saldo por cobrar: <strong>{currencyFormatter(due)}</strong>
              </p>
              <p className="rounded-md border p-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">{message}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" className="min-h-11 gap-2" onClick={() => void onCopy(message, "Mensaje para WhatsApp")}>
                  <Copy aria-hidden="true" className="h-4 w-4" />
                  Copiar mensaje
                </Button>
                <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => void onCopy(link, "Enlace del pedido")}>
                  <Link2 aria-hidden="true" className="h-4 w-4" />
                  Copiar enlace
                </Button>
              </div>
            </div>
            <DialogFooter className="gap-2">
              {!order.pickup ? (
                <Button type="button" variant="ghost" className="min-h-11" onClick={() => setView("request")}>
                  Cambiar el envío
                </Button>
              ) : null}
              <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
