"use client";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { TintBadge } from "@/components/ui/tint-badge";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  canTransitionRestockOrder,
  getRestockProgress,
  landedCostFactor,
  landedUnitCost,
  RECEIVABLE_STATUSES,
  RESTOCK_STATUS_LABELS,
  RESTOCK_STATUS_TONES,
} from "@/lib/restock-orders";
import type { RestockOrderWithRelations } from "@/lib/restock-orders-db";
import { cn, currencyFormatter } from "@/lib/utils";
import { RestockOrderStatus } from "@prisma/client";
import axios from "axios";
import { PackageCheck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { ReceiveDialog } from "./receive-dialog";
import { RestockSteps } from "./restock-steps";

const fmtDate = (value: Date | string, withTime = false) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "America/Bogota",
  }).format(new Date(value));

interface RestockOrderWorkspaceProps {
  order: RestockOrderWithRelations;
  openReceive?: boolean;
}

/** Página de un pedido ya hecho al proveedor: líneas fijas, notas aparte, recepciones y zona de cuidado. */
export function RestockOrderWorkspace({ order, openReceive = false }: RestockOrderWorkspaceProps) {
  const params = useParams();
  const router = useRouter();
  const storeId = String(params.storeId);
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [notes, setNotes] = useState(order.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(openReceive);

  const progress = getRestockProgress(order.items);
  const context = { receivedUnits: progress.receivedUnits };
  const receivable = RECEIVABLE_STATUSES.includes(order.status);
  const cancelled = order.status === RestockOrderStatus.CANCELLED;
  const completed = order.status === RestockOrderStatus.COMPLETED;
  const canCancel = canTransitionRestockOrder(order.status, RestockOrderStatus.CANCELLED, context) && !cancelled;
  const canClose = receivable && canTransitionRestockOrder(order.status, RestockOrderStatus.COMPLETED, context);
  const notesDirty = notes.trim() !== (order.notes ?? "").trim();
  const factor = landedCostFactor(order.totalAmount, order.shippingCost);
  const shippingPercent = Math.round((factor - 1) * 1000) / 10;
  const total = Math.round((order.totalAmount + order.shippingCost) * 100) / 100;

  const patch = async (body: Record<string, unknown>, success: string) => {
    try {
      setBusy(true);
      await axios.patch(`/api/${storeId}/restock-orders/${order.id}`, body);
      toast({ title: success, variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: getErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async () => {
    setSaving(true);
    await patch({ notes }, "Notas guardadas.");
    setSaving(false);
  };

  const closeShort = async () => {
    const confirmed = await requestConfirmation({
      title: `Cerrar el pedido ${order.orderNumber}`,
      description: `Faltan ${progress.remainingUnits} unidades que no llegarán. El pedido queda completado con lo recibido; el inventario no cambia.`,
      confirmLabel: "Cerrar pedido",
      cancelLabel: "Volver",
    });
    if (confirmed) await patch({ status: RestockOrderStatus.COMPLETED }, "Pedido cerrado.");
  };

  const cancel = async () => {
    const confirmed = await requestConfirmation({
      title: `Cancelar el pedido ${order.orderNumber}`,
      description: "No se ha recibido nada, así que el inventario no cambia. Podrás volverlo a borrador si hace falta.",
      confirmLabel: "Cancelar pedido",
      cancelLabel: "Volver",
      destructive: true,
    });
    if (confirmed) await patch({ status: RestockOrderStatus.CANCELLED }, "Pedido cancelado.");
  };

  const reopen = async () => {
    await patch({ status: RestockOrderStatus.DRAFT }, "El pedido vuelve a ser un borrador.");
  };

  const remove = async () => {
    const confirmed = await requestConfirmation({
      title: `Eliminar el pedido ${order.orderNumber}`,
      description: "Está cancelado y no recibió mercancía. Se borra definitivamente; su número no se reutiliza.",
      confirmLabel: "Eliminar",
      cancelLabel: "Volver",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      setBusy(true);
      await axios.delete(`/api/${storeId}/restock-orders/${order.id}`);
      toast({ title: "Pedido eliminado.", variant: "success" });
      router.push(`/${storeId}/aprovisionamiento`);
      router.refresh();
    } catch (error) {
      toast({ title: getErrorMessage(error), variant: "destructive" });
      setBusy(false);
    }
  };

  return (
    <>
      {confirmationDialog}
      <ReceiveDialog order={order} open={receiveOpen} onOpenChange={setReceiveOpen} />

      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          <Link href={`/${storeId}/aprovisionamiento`} className="hover:underline">
            Aprovisionamiento
          </Link>{" "}
          › {order.orderNumber}
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-primary">Pedido {order.orderNumber}</h1>
              <TintBadge label={RESTOCK_STATUS_LABELS[order.status]} tone={RESTOCK_STATUS_TONES[order.status]} />
            </div>
            <p className="text-sm text-muted-foreground">
              {order.supplier.name} · {progress.lineCount} {progress.lineCount === 1 ? "línea" : "líneas"} · {progress.receivedUnits} de {progress.orderedUnits} unidades recibidas · pedido el {fmtDate(order.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/${storeId}/aprovisionamiento`}>Volver a aprovisionamiento</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={saveNotes} disabled={!notesDirty || saving || busy} isLoading={saving} loadingText="Guardando…">
              Guardar notas
            </Button>
            {receivable && (
              <Button type="button" size="sm" onClick={() => setReceiveOpen(true)} disabled={busy}>
                <PackageCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                Recibir mercancía
              </Button>
            )}
          </div>
        </div>
      </div>

      <RestockSteps status={order.status} receivedUnits={progress.receivedUnits} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <SectionCard
            id="lineas"
            title="Líneas del pedido"
            description="Cantidades y costos quedan fijos al pedir; lo que cambia después es lo recibido."
            action={
              progress.remainingUnits > 0 ? (
                <TintBadge label={`${progress.remainingUnits} ${progress.remainingUnits === 1 ? "unidad pendiente" : "unidades pendientes"}`} tone="cream" />
              ) : (
                <TintBadge label="Todo recibido" tone="mint" />
              )
            }
          >
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Pedido</TableHead>
                    <TableHead>Recibido</TableHead>
                    <TableHead className="text-right">Costo unit.</TableHead>
                    <TableHead className="text-right">Costo puesto en bodega</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => {
                    const percent = item.quantity > 0 ? Math.min(100, Math.round((item.quantityReceived / item.quantity) * 100)) : 0;
                    const excess = item.quantityReceived > item.quantity;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium text-primary">{item.product.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.product.sku ? `${item.product.sku} · ` : ""}stock {item.product.stock}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                        <TableCell>
                          <div className="flex min-w-[110px] flex-col gap-1">
                            <span className={cn("text-xs", excess ? "text-primary" : "text-muted-foreground")}>
                              {item.quantityReceived} de {item.quantity}
                              {excess ? ` (+${item.quantityReceived - item.quantity})` : ""}
                            </span>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                              <div className={cn("h-full rounded-full", percent >= 100 ? "bg-tint-mint" : "bg-primary/60")} style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{currencyFormatter(item.cost)}</TableCell>
                        <TableCell className="text-right">
                          {currencyFormatter(landedUnitCost(item.cost, order.totalAmount, order.shippingCost))}
                          {shippingPercent > 0 && <span className="ml-1 text-[11px] text-muted-foreground">(+{shippingPercent.toLocaleString("es-CO")} % envío)</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium">{currencyFormatter(item.subtotal)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <tbody className="border-t bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="py-2 text-right text-sm text-muted-foreground">Mercancía</TableCell>
                    <TableCell className="py-2 text-right">{currencyFormatter(order.totalAmount)}</TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="py-2 text-right text-sm text-muted-foreground">Envío / logística</TableCell>
                    <TableCell className="py-2 text-right">{currencyFormatter(order.shippingCost)}</TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="py-2 text-right font-semibold text-primary">Total</TableCell>
                    <TableCell className="py-2 text-right font-semibold text-primary">{currencyFormatter(total)}</TableCell>
                  </TableRow>
                </tbody>
              </Table>
            </div>
          </SectionCard>
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard id="notas" title="Notas" description="Lo único editable después de pedir. Se guarda aparte de las líneas.">
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              maxLength={2000}
              disabled={busy || cancelled}
              aria-label="Notas del pedido"
              placeholder="Ej: llegan en dos entregas; la segunda con los resaltadores."
            />
            {notesDirty && !cancelled && (
              <Button type="button" size="sm" className="self-end" onClick={saveNotes} disabled={saving || busy} isLoading={saving} loadingText="Guardando…">
                Guardar notas
              </Button>
            )}
          </SectionCard>

          <SectionCard id="recepciones" title="Recepciones" description="Cada recepción es un movimiento de inventario con su costo puesto en bodega.">
            {order.receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{receivable ? "Todavía no ha llegado nada." : "Sin recepciones."}</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {order.receipts.map((receipt) => (
                  <li key={receipt.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      {fmtDate(receipt.createdAt, true)} · {receipt.receivedUnits} {receipt.receivedUnits === 1 ? "unidad" : "unidades"} en {receipt.lineCount} {receipt.lineCount === 1 ? "línea" : "líneas"}
                      {receipt.excessUnits > 0 ? ` · ${receipt.excessUnits} de más` : ""}
                    </span>
                    <Link href={`/${storeId}/movimientos-inventario?referencia=${order.id}`} className="text-xs font-medium text-primary underline-offset-2 hover:underline">
                      Ver movimientos
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            id="zona-de-cuidado"
            title="Zona de cuidado"
            tone="care"
            description={
              completed
                ? "Un pedido completado es historial: no cambia de estado."
                : cancelled
                  ? "Cancelado sin mercancía recibida. Puedes retomarlo como borrador o eliminarlo."
                  : progress.receivedUnits > 0
                    ? "Con mercancía recibida ya no se puede cancelar: si lo que falta no llegará, ciérralo."
                    : "Cancelar solo es posible mientras no haya nada recibido."
            }
          >
            <div className="flex flex-wrap gap-2">
              {canClose && (
                <Button type="button" variant="outline" size="sm" onClick={closeShort} disabled={busy}>
                  Cerrar pedido{progress.remainingUnits > 0 ? ` (faltan ${progress.remainingUnits})` : ""}
                </Button>
              )}
              {canCancel && (
                <Button type="button" variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={cancel} disabled={busy}>
                  Cancelar pedido
                </Button>
              )}
              {cancelled && (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={reopen} disabled={busy}>
                    Volver a borrador
                  </Button>
                  {progress.receivedUnits === 0 && (
                    <Button type="button" variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={remove} disabled={busy}>
                      Eliminar
                    </Button>
                  )}
                </>
              )}
              {!canClose && !canCancel && !cancelled && (
                <p className="text-xs text-muted-foreground">Sin acciones disponibles.</p>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

