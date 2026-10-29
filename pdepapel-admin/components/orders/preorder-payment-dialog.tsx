"use client";

import axios from "axios";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { currencyFormatter } from "@/lib/utils";

const METHODS = [
  { value: "BankTransfer", label: "Transferencia o Bre-B" },
  { value: "CASH", label: "Efectivo" },
  { value: "Bold", label: "Datáfono o enlace de Bold" },
  { value: "Wompi", label: "Wompi" },
] as const;

function bogotaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export type PreorderPaymentTarget =
  | { mode: "deposit"; presaleId: string; source: { kind: "order"; orderId: string } | { kind: "waitlist"; entryId: string } }
  | { mode: "balance"; orderId: string };

/**
 * «Marcar anticipo recibido» y «Marcar saldo recibido»: valor, fecha, medio,
 * nota y «Avisar a la clienta», que arranca APAGADA. Sin la casilla no sale
 * correo ni WhatsApp: queda anotado en «Avisos a la clienta».
 */
export function PreorderPaymentDialog({
  storeId,
  target,
  open,
  onOpenChange,
  defaultAmount,
  defaultShippingCost = 0,
  subjectLabel,
  onDone,
}: {
  storeId: string;
  target: PreorderPaymentTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAmount: number;
  defaultShippingCost?: number;
  /** «el pedido #…» o el nombre de quien está en la lista. */
  subjectLabel: string;
  onDone?: (result: { orderId?: string }) => void;
}) {
  const { toast } = useToast();
  const isDeposit = target.mode === "deposit";
  const [amount, setAmount] = useState<number | undefined>(defaultAmount);
  const [quantity, setQuantity] = useState("1");
  const [shippingCost, setShippingCost] = useState<number | undefined>(defaultShippingCost);
  const [paidAt, setPaidAt] = useState(bogotaToday());
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("BankTransfer");
  const [note, setNote] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [saving, setSaving] = useState(false);

  const balanceDue = !isDeposit ? Math.max(0, defaultAmount + (shippingCost ?? 0) - defaultShippingCost) : null;

  const submit = async () => {
    try {
      setSaving(true);
      const common = {
        amount: isDeposit ? amount : balanceDue,
        paidAt: `${paidAt}T12:00:00-05:00`,
        method,
        note: note.trim() || null,
        notifyCustomer,
      };
      const { data } =
        target.mode === "deposit"
          ? await axios.post(`/api/${storeId}/presales/${target.presaleId}/deposits`, {
              ...common,
              source: target.source.kind === "waitlist" ? { ...target.source, quantity: Number(quantity) || 1 } : target.source,
            })
          : await axios.post(`/api/${storeId}/orders/${target.orderId}/balance`, { ...common, shippingCost: shippingCost ?? 0 });
      toast({
        title: isDeposit ? "Anticipo anotado" : "Saldo anotado: pedido pagado",
        description: notifyCustomer ? "La clienta recibe el aviso por correo." : "Sin avisar a la clienta: quedó anotado en «Avisos a la clienta».",
        variant: "success",
      });
      onOpenChange(false);
      onDone?.({ orderId: data?.orderId });
    } catch (error) {
      toast({ title: "No se pudo anotar el pago", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isDeposit ? "Marcar anticipo recibido" : "Marcar saldo recibido"}</DialogTitle>
          <DialogDescription>
            {isDeposit
              ? `Anota el anticipo de ${subjectLabel}. No es venta: el pedido queda «Anticipo recibido» y espera la mercancía.`
              : `Anota el saldo de ${subjectLabel}. El pedido pasa a pagado y entra al despacho.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {isDeposit && target.mode === "deposit" && target.source.kind === "waitlist" ? (
            <div className="space-y-2">
              <Label htmlFor="preorder-payment-quantity">Unidades</Label>
              <Input id="preorder-payment-quantity" type="number" min={1} max={20} className="h-11" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </div>
          ) : null}
          {isDeposit ? (
            <div className="space-y-2">
              <Label htmlFor="preorder-payment-amount">Valor recibido</Label>
              <CurrencyInput id="preorder-payment-amount" className="h-11" value={amount} onChange={setAmount} />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="preorder-payment-shipping">Envío cobrado con el saldo</Label>
                <CurrencyInput id="preorder-payment-shipping" className="h-11" value={shippingCost} onChange={setShippingCost} />
              </div>
              <p className="rounded-md bg-muted p-3 text-sm">
                Saldo a recibir: <strong>{currencyFormatter(balanceDue ?? 0)}</strong>
              </p>
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="preorder-payment-date">Fecha del pago</Label>
              <Input id="preorder-payment-date" type="date" className="h-11" max={bogotaToday()} value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preorder-payment-method">Cómo te pagaron</Label>
              <select
                id="preorder-payment-method"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={method}
                onChange={(event) => setMethod(event.target.value as typeof method)}
              >
                {METHODS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="preorder-payment-note">Nota (opcional)</Label>
            <Textarea id="preorder-payment-note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej.: comprobante por WhatsApp" />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox checked={notifyCustomer} onCheckedChange={(checked) => setNotifyCustomer(checked === true)} aria-label="Avisar a la clienta" />
            Avisar a la clienta por correo
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" className="min-h-11" disabled={saving || (isDeposit ? !amount : balanceDue === null)} onClick={submit}>
            {isDeposit ? "Anotar anticipo" : "Anotar saldo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
