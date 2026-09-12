"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { landedCostFactor, landedUnitCost, remainingUnits } from "@/lib/restock-orders";
import { currencyFormatter } from "@/lib/utils";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export interface ReceivableOrder {
  id: string;
  orderNumber: string;
  totalAmount: number;
  shippingCost: number;
  items: {
    id: string;
    productId: string;
    quantity: number;
    quantityReceived: number;
    cost: number;
    product: { name: string; sku: string | null; acqPrice: number | null };
  }[];
}

interface ReceiveDialogProps {
  order: ReceivableOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`);

/**
 * Recepción de mercancía: cada línea propone lo que falta, recibir de más
 * exige confirmarlo y la clave de idempotencia nace al abrir el diálogo, así
 * un reintento tras una respuesta lenta no duplica el stock.
 */
export function ReceiveDialog({ order, open, onOpenChange }: ReceiveDialogProps) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [excessConfirmed, setExcessConfirmed] = useState<Record<string, boolean>>({});
  const [updateCosts, setUpdateCosts] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuantities(Object.fromEntries(order.items.map((item) => [item.id, remainingUnits(item)])));
    setExcessConfirmed({});
    setUpdateCosts(true);
    setIdempotencyKey(newKey());
    setSubmitting(false);
  }, [open, order.items]);

  const factor = landedCostFactor(order.totalAmount, order.shippingCost);
  const shippingPercent = Math.round((factor - 1) * 1000) / 10;

  const lines = useMemo(
    () =>
      order.items.map((item) => {
        const remaining = remainingUnits(item);
        const quantity = quantities[item.id] ?? 0;
        const excess = Math.max(0, quantity - remaining);
        return { item, remaining, quantity, excess, landed: landedUnitCost(item.cost, order.totalAmount, order.shippingCost) };
      }),
    [order.items, order.totalAmount, order.shippingCost, quantities],
  );
  const receivingUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
  const receivingLines = lines.filter((line) => line.quantity > 0).length;
  const unconfirmedExcess = lines.some((line) => line.excess > 0 && !excessConfirmed[line.item.id]);
  const costChanges = lines.filter((line) => line.quantity > 0 && (line.item.product.acqPrice ?? 0) !== line.item.cost).length;

  const submit = async () => {
    if (receivingUnits === 0 || unconfirmedExcess || submitting) return;
    setSubmitting(true);
    try {
      await axios.post(`/api/${params.storeId}/restock-orders/${order.id}/receive`, {
        idempotencyKey,
        updateCosts,
        assignSupplier: true,
        lines: lines
          .filter((line) => line.quantity > 0)
          .map((line) => ({ restockOrderItemId: line.item.id, quantity: line.quantity, allowExcess: line.excess > 0 })),
      });
      toast({ title: `Recibidas ${receivingUnits} unidades del pedido ${order.orderNumber}.`, variant: "success" });
      router.refresh();
      onOpenChange(false);
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      toast({ title: getErrorMessage(error), variant: status === 409 ? "default" : "destructive" });
      if (status === 409) {
        router.refresh();
        onOpenChange(false);
      } else {
        // Un error real: la misma clave sigue siendo válida para reintentar.
        setSubmitting(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Recibir mercancía de {order.orderNumber}</DialogTitle>
          <DialogDescription>
            Cada línea propone lo que falta. Puedes recibir menos; para recibir de más tendrás que confirmarlo.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Faltan</TableHead>
                <TableHead className="w-[150px]">Recibir ahora</TableHead>
                <TableHead className="text-right">Costo puesto en bodega</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map(({ item, remaining, quantity, excess, landed }) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.product.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.quantityReceived} de {item.quantity} recibidos{item.product.sku ? ` · ${item.product.sku}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{remaining}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      <StockQuantityInput
                        min={0}
                        size="sm"
                        disabled={submitting}
                        value={quantity}
                        onChange={(value) => setQuantities((prev) => ({ ...prev, [item.id]: Math.max(0, Math.floor(value || 0)) }))}
                        ariaLabel={`Unidades a recibir de ${item.product.name}`}
                      />
                      {excess > 0 && (
                        <label className="flex items-start gap-2 text-[11px] text-primary/90">
                          <Checkbox
                            checked={Boolean(excessConfirmed[item.id])}
                            onCheckedChange={(checked) => setExcessConfirmed((prev) => ({ ...prev, [item.id]: checked === true }))}
                            aria-label={`Confirmar ${excess} de más en ${item.product.name}`}
                            className="mt-0.5"
                          />
                          <span>
                            {excess} más de lo pedido: se registrará como excedente.
                          </span>
                        </label>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {quantity > 0 ? (
                      <div className="flex flex-col items-end">
                        <span className="font-medium">{currencyFormatter(landed)}</span>
                        {shippingPercent > 0 && <span className="text-[11px] text-muted-foreground">+{shippingPercent.toLocaleString("es-CO")} % envío</span>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/40 p-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label htmlFor="recepcion-costos" className="text-sm font-semibold text-primary">
              Actualizar el costo de adquisición de cada producto
            </Label>
            <span className="text-xs text-muted-foreground">
              Deja el costo unitario de esta compra como costo de adquisición y la parte del envío como transporte por unidad.
              Afecta márgenes y el precio mínimo en Mercado Libre.
              {costChanges > 0 ? ` Cambia en ${costChanges} ${costChanges === 1 ? "producto" : "productos"}.` : ""}
            </span>
          </div>
          <Switch id="recepcion-costos" checked={updateCosts} onCheckedChange={setUpdateCosts} disabled={submitting} />
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {receivingLines > 0
              ? `Se crearán ${receivingLines} ${receivingLines === 1 ? "movimiento" : "movimientos"} de inventario. Esta recepción no se puede repetir por accidente: el botón queda bloqueado hasta terminar.`
              : "Ingresa al menos una cantidad."}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="button" onClick={submit} disabled={submitting || receivingUnits === 0 || unconfirmedExcess} isLoading={submitting} loadingText="Recibiendo…">
              Recibir {receivingUnits} {receivingUnits === 1 ? "unidad" : "unidades"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
