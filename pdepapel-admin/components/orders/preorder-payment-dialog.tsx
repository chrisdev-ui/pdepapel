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
  | { mode: "installment"; orderId: string }
  | { mode: "balance"; orderId: string };

/**
 * «Marcar anticipo recibido», «Registrar abono» y «Marcar saldo recibido»: valor, fecha, medio,
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
  const isInstallment = target.mode === "installment";
  // Anticipo y abono: el valor lo escribe Paula. Saldo: lo calcula el servidor.
  const amountEditable = isDeposit || isInstallment;
  const [amount, setAmount] = useState<number | undefined>(isInstallment ? undefined : defaultAmount);
  const [quantity, setQuantity] = useState("1");
  const [shippingCost, setShippingCost] = useState<number | undefined>(defaultShippingCost);
  const [paidAt, setPaidAt] = useState(bogotaToday());
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("BankTransfer");
  const [note, setNote] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [saving, setSaving] = useState(false);

  const balanceDue = target.mode === "balance" ? Math.max(0, defaultAmount + (shippingCost ?? 0) - defaultShippingCost) : null;
  const overRemaining = isInstallment && amount !== undefined && amount > defaultAmount;

  const submit = async () => {
    try {
      setSaving(true);
      const common = {
        amount: amountEditable ? amount : balanceDue,
        // Hoy va con la hora actual: el mediodía de hoy es futuro antes de las 12 y el servidor lo rechaza.
        paidAt: paidAt === bogotaToday() ? new Date().toISOString() : `${paidAt}T12:00:00-05:00`,
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
          : target.mode === "installment"
            ? await axios.post(`/api/${storeId}/orders/${target.orderId}/installments`, common)
            : await axios.post(`/api/${storeId}/orders/${target.orderId}/balance`, { ...common, shippingCost: shippingCost ?? 0 });
      toast({
        title: isDeposit ? "Anticipo anotado" : isInstallment ? "Abono anotado" : "Saldo anotado: pedido pagado",
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
          <DialogTitle>{isDeposit ? "Marcar anticipo recibido" : isInstallment ? "Registrar abono" : "Marcar saldo recibido"}</DialogTitle>
          <DialogDescription>
            {isDeposit
              ? `Anota el anticipo de ${subjectLabel}. No es venta: el pedido queda «Anticipo recibido» y espera la mercancía.`
              : isInstallment
                ? `Anota un abono de ${subjectLabel}. No es venta: el pedido sigue «Anticipo recibido» hasta el saldo.`
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
          {amountEditable ? (
            <div className="space-y-2">
              <Label htmlFor="preorder-payment-amount">Valor recibido</Label>
              <CurrencyInput
                id="preorder-payment-amount"
                className="h-11"
                value={amount}
                onChange={setAmount}
                aria-describedby={isInstallment ? "preorder-payment-remaining" : undefined}
                aria-invalid={overRemaining || undefined}
              />
              {isInstallment ? (
                <p id="preorder-payment-remaining" className={overRemaining ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
                  {overRemaining
                    ? `Pasa de lo que falta: el abono puede ser hasta ${currencyFormatter(defaultAmount)}.`
                    : `Falta ${currencyFormatter(defaultAmount)} + envío.`}
                </p>
              ) : null}
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
          <Button type="button" className="min-h-11" disabled={saving || (amountEditable ? !amount || overRemaining : balanceDue === null)} onClick={submit}>
            {isDeposit ? "Anotar anticipo" : isInstallment ? "Anotar abono" : "Anotar saldo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
