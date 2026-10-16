"use client";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useCanWrite } from "@/components/shell/viewer-access";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { ShippingCorrectionLine } from "@/lib/restock-orders";
import { displayRestockOrderNumber } from "@/lib/restock-orders";
import { currencyFormatter } from "@/lib/utils";
import axios from "axios";
import { ArrowRight } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ShippingCorrectionPlan {
  shippingBefore: number;
  shippingAfter: number;
  lines: ShippingCorrectionLine[];
  changed: number;
}

interface ShippingCorrectionDialogProps {
  order: { id: string; orderNumber: string; shippingCost: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const money = (value: number | null) => (value === null ? "sin registrar" : currencyFormatter(value));
const received = (line: ShippingCorrectionLine) => `${line.received} ${line.received === 1 ? "unidad recibida" : "unidades recibidas"}`;

/**
 * «Corregir envío»: el envío real de la compra se reparte entre sus líneas
 * igual que en la recepción. Lo que se confirma es exactamente la vista
 * previa: el servidor rechaza la escritura si algún costo cambió entretanto.
 */
export function ShippingCorrectionDialog({ order, open, onOpenChange }: ShippingCorrectionDialogProps) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const [shipping, setShipping] = useState<number | undefined>(order.shippingCost);
  const [plan, setPlan] = useState<ShippingCorrectionPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const url = `/api/${params.storeId}/restock-orders/${order.id}/shipping-correction`;
  const orderNumber = displayRestockOrderNumber(order.orderNumber);

  useEffect(() => {
    if (!open) return;
    setShipping(order.shippingCost);
    setPlan(null);
    setLoading(false);
    setSaving(false);
  }, [open, order.shippingCost]);

  const preview = async () => {
    if (shipping === undefined || loading) return;
    setLoading(true);
    try {
      const { data } = await axios.post<ShippingCorrectionPlan>(url, { shippingCost: shipping });
      setPlan(data);
    } catch (error) {
      toast({ title: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!plan || saving) return;
    setSaving(true);
    try {
      const { data } = await axios.post<ShippingCorrectionPlan>(url, {
        shippingCost: plan.shippingAfter,
        confirm: true,
        expected: plan.lines.map((line) => ({ productId: line.productId, transportationCost: line.shareBefore })),
      });
      toast({
        title:
          data.changed > 0
            ? `Envío corregido en ${data.changed} ${data.changed === 1 ? "producto" : "productos"}.`
            : data.shippingAfter !== order.shippingCost
              ? "Envío del pedido corregido; ningún producto cambió."
              : "El envío ya estaba así: no cambió nada.",
        variant: "success",
      });
      router.refresh();
      onOpenChange(false);
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      toast({ title: getErrorMessage(error), variant: status === 409 ? "default" : "destructive" });
      // Algo cambió desde la vista previa: hay que volver a verla antes de confirmar.
      if (status === 409) setPlan(null);
      setSaving(false);
    }
  };

  const changing = plan?.lines.filter((line) => !line.skipped && line.shareAfter !== line.shareBefore) ?? [];
  const unchanged = plan?.lines.filter((line) => !changing.includes(line)) ?? [];
  const toChange = changing.length;
  const orderShippingChanges = plan !== null && plan.shippingAfter !== order.shippingCost;
  const canConfirm = canWrite && plan !== null && (toChange > 0 || orderShippingChanges);

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Corregir el envío de {orderNumber}</DialogTitle>
          <DialogDescription>
            Escribe lo que costó en realidad el envío de toda la compra. Se reparte entre los productos según el valor de cada línea, igual que al recibir.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="envio-real">Envío real de la compra</Label>
            <CurrencyInput
              id="envio-real"
              value={shipping}
              disabled={loading || saving}
              onChange={(value) => {
                setShipping(value);
                setPlan(null);
              }}
            />
            <span className="text-xs text-muted-foreground">Registrado hoy: {currencyFormatter(order.shippingCost)}</span>
          </div>
          <Button type="button" variant="outline" onClick={preview} disabled={shipping === undefined || loading || saving} isLoading={loading} loadingText="Calculando…" className="sm:mb-6">
            Ver cambios
          </Button>
        </div>

        {plan && (
          <div className="flex flex-col gap-2">
            {changing.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-primary">Cambian ({changing.length})</h3>
                <ul className="flex flex-col gap-2" aria-label="Cambios por producto">
                  {changing.map((line) => (
                    <li key={line.productId} className="rounded-lg border p-3 text-sm">
                      <div className="font-medium text-primary">{line.name}</div>
                      <div className="text-xs text-muted-foreground">{received(line)}</div>
                      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                        <dt className="text-muted-foreground">Envío por unidad</dt>
                        <dd className="flex flex-wrap items-center gap-1">
                          <span>{money(line.shareBefore)}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" aria-label="pasa a" />
                          <strong className="font-semibold text-primary">{money(line.shareAfter)}</strong>
                        </dd>
                        <dt className="text-muted-foreground">Costo por unidad</dt>
                        <dd className="flex flex-wrap items-center gap-1">
                          <span>{money(line.costBefore)}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" aria-label="pasa a" />
                          <strong className="font-semibold text-primary">{money(line.costAfter)}</strong>
                        </dd>
                      </dl>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {unchanged.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-primary">No se cambian ({unchanged.length})</h3>
                <ul className="flex flex-col gap-2" aria-label="Productos que no se cambian">
                  {unchanged.map((line) => (
                    <li key={line.productId} className="rounded-lg border bg-muted/40 p-3 text-sm">
                      <div className="font-medium text-primary">{line.name}</div>
                      <div className="text-xs text-muted-foreground">{received(line)}</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {line.skipped ?? `Sin cambio: ya tiene ${money(line.shareAfter)} de envío por unidad.`}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="rounded-xl border p-3 text-xs text-muted-foreground">
              {toChange > 0 ? (
                <>
                  Cambia el envío por unidad de <strong className="font-semibold text-primary">{toChange} {toChange === 1 ? "producto" : "productos"}</strong>, el envío del pedido
                  queda en {currencyFormatter(plan.shippingAfter)} y cada producto deja un movimiento de 0 unidades con su costo nuevo en el kardex.
                </>
              ) : orderShippingChanges ? (
                <>Ningún producto cambia; solo el envío del pedido queda en {currencyFormatter(plan.shippingAfter)}.</>
              ) : (
                <>Con este envío no cambia nada.</>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirm} disabled={!canConfirm || saving} isLoading={saving} loadingText="Guardando…">
            {toChange > 0 ? `Confirmar en ${toChange} ${toChange === 1 ? "producto" : "productos"}` : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
