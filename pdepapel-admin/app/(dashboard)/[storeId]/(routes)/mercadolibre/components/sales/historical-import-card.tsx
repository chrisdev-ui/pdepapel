"use client";

import { Download, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TintBadge } from "@/components/ui/tint-badge";
import { getRawOrderStatusMeta } from "@/lib/mercadolibre/order-status";

import { formatSaleAmount, formatSaleDate, getResponseError, type SaleFeedback } from "./sale-types";

type ProductReference = { id: string; name: string; sku: string; stock: number };

type HistoricalSaleInspection = {
  referenceType: "order" | "pack";
  pack: { id: string; status: string | null } | null;
  orders: {
    externalOrderId: string;
    status: string;
    paidAt: string | null;
    totalAmount: number;
    currencyId: string | null;
    alreadyImported: boolean;
    inventoryStatus: string | null;
    items: {
      externalItemId: string;
      title: string;
      sku: string | null;
      quantity: number;
      unitPrice: number;
      linkedProduct: ProductReference | null;
      suggestedProduct: ProductReference | null;
    }[];
  }[];
};

const RAW_STATUS_TONE: Record<string, string> = {
  paid: "mint",
  confirmed: "sky",
  cancelled: "pink",
  invalid: "pink",
  refunded: "pink",
  charged_back: "pink",
  partially_refunded: "cream",
};

function toCurrencyInputValue(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Importación de una venta anterior a la integración. Es la excepción, no
 * el día a día: las ventas nuevas llegan solas por webhook. Por eso vive
 * debajo de la lista y lo dice en su encabezado.
 */
export function HistoricalImportCard({
  storeId,
  canReconcile,
  onFeedback,
  onImported,
}: {
  storeId: string;
  canReconcile: boolean;
  onFeedback: (feedback: SaleFeedback | null) => void;
  onImported: () => Promise<void> | void;
}) {
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [reference, setReference] = useState("");
  const [inspection, setInspection] = useState<HistoricalSaleInspection | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [marketplaceFee, setMarketplaceFee] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [taxesAmount, setTaxesAmount] = useState("");
  const [isInspecting, setIsInspecting] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);

  const selectedOrder = useMemo(
    () => inspection?.orders.find((order) => order.externalOrderId === selectedOrderId) ?? null,
    [inspection, selectedOrderId],
  );
  const calculatedNet = selectedOrder
    ? selectedOrder.totalAmount -
      Number(marketplaceFee || 0) -
      Number(shippingCost || 0) -
      Number(taxesAmount || 0)
    : null;
  const hasMappedItems = Boolean(
    selectedOrder?.items.every((item) => item.linkedProduct || item.suggestedProduct),
  );
  const hasFinancialDetails = marketplaceFee !== "" && shippingCost !== "" && taxesAmount !== "";
  const listingsToCreate =
    selectedOrder?.items.filter((item) => !item.linkedProduct && item.suggestedProduct).length ?? 0;

  const resetCharges = () => {
    setMarketplaceFee("");
    setShippingCost("");
    setTaxesAmount("");
    setPrefillNote(null);
  };

  const inspectSale = async () => {
    if (!reference.trim()) {
      onFeedback({ type: "error", message: "Ingresa el número de venta o de pack de Mercado Libre" });
      return;
    }
    setIsInspecting(true);
    onFeedback(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/historical-sales/inspect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: reference.trim() }),
        },
      );
      if (!response.ok) throw new Error(await getResponseError(response));
      const result = (await response.json()) as HistoricalSaleInspection;
      setInspection(result);
      const firstPendingOrder = result.orders.find(
        (order) => order.status === "paid" && !order.alreadyImported,
      );
      setSelectedOrderId(firstPendingOrder?.externalOrderId ?? result.orders[0]?.externalOrderId ?? "");
      resetCharges();
    } catch (error) {
      setInspection(null);
      onFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "No fue posible revisar la venta de Mercado Libre",
      });
    } finally {
      setIsInspecting(false);
    }
  };

  const prefillCharges = async () => {
    if (!selectedOrder) return;
    setIsPrefilling(true);
    setPrefillNote(null);
    try {
      const query = new URLSearchParams({
        order: selectedOrder.externalOrderId,
        total: String(selectedOrder.totalAmount),
      });
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/historical-sales/financials?${query}`,
      );
      if (!response.ok) throw new Error(await getResponseError(response));
      const result = (await response.json()) as
        | { pending: true; message: string }
        | { pending: false; marketplaceFee: number; shippingCost: number; taxesAmount: number };
      if (result.pending) {
        setPrefillNote(`${result.message}. Puedes escribir los cargos a mano mientras tanto.`);
        return;
      }
      setMarketplaceFee(String(result.marketplaceFee));
      setShippingCost(String(result.shippingCost));
      setTaxesAmount(String(result.taxesAmount));
      setPrefillNote("Cargos tomados de la facturación de Mercado Libre. Revísalos antes de importar.");
    } catch (error) {
      setPrefillNote(
        error instanceof Error
          ? error.message
          : "No fue posible consultar los cargos en Mercado Libre",
      );
    } finally {
      setIsPrefilling(false);
    }
  };

  const reconcileSale = async () => {
    if (!selectedOrder || !hasMappedItems || !hasFinancialDetails) return;
    if (calculatedNet === null || calculatedNet < 0) {
      onFeedback({ type: "error", message: "Los cargos no pueden ser mayores al total de la venta" });
      return;
    }
    const consequences = [
      `Se registra la venta ${selectedOrder.externalOrderId} como pagada con neto ${formatSaleAmount(calculatedNet)} (ingresado a mano, no verificado por Mercado Libre).`,
      "Se descuenta su inventario una sola vez (los kits descuentan componentes) y queda un movimiento por producto.",
      listingsToCreate > 0
        ? `Se crean ${listingsToCreate} publicaciones vinculadas en P de Papel con sincronización de stock activa y sin reserva de seguridad; revísalas después en Publicaciones.`
        : "Las publicaciones ya vinculadas se reutilizan.",
      "Se envía el stock actualizado a Mercado Libre.",
    ].join(" ");
    if (
      !(await requestConfirmation({
        title: "¿Importar esta venta anterior?",
        description: consequences,
        confirmLabel: "Importar venta",
      }))
    ) {
      return;
    }
    setIsReconciling(true);
    onFeedback(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/historical-sales/reconcile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            externalOrderId: selectedOrder.externalOrderId,
            marketplaceFee,
            shippingCost,
            taxesAmount,
          }),
        },
      );
      if (!response.ok) throw new Error(await getResponseError(response));
      onFeedback({
        type: "success",
        message: `Venta ${selectedOrder.externalOrderId} importada: inventario descontado y stock enviado a Mercado Libre.`,
      });
      setInspection(null);
      setSelectedOrderId("");
      setReference("");
      resetCharges();
      await onImported();
    } catch (error) {
      onFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "No fue posible importar la venta de Mercado Libre",
      });
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <SectionCard
      id="importar-venta-anterior"
      title="Importar una venta anterior a la integración"
      description="Solo para ventas de antes de conectar Mercado Libre: las nuevas llegan solas. Revisar no cambia nada; importar descuenta inventario una vez."
    >
      {!canReconcile ? (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          Conecta Mercado Libre y activa el procesamiento seguro antes de importar ventas anteriores.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="historical-reference">Número de venta o pack</Label>
            <Input
              id="historical-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Ej.: 2000017813937484"
              inputMode="numeric"
            />
          </div>
          <Button type="button" onClick={() => void inspectSale()} disabled={isInspecting}>
            {isInspecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Revisar venta
          </Button>
        </div>
      )}

      {inspection ? (
        <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <TintBadge label={inspection.referenceType === "pack" ? "Pack" : "Orden"} tone="lavender" />
            {inspection.pack ? <span>Pack {inspection.pack.id}</span> : null}
            <span className="text-muted-foreground">Esta revisión todavía no cambia inventario.</span>
          </div>
          {inspection.orders.length > 1 ? (
            <div className="grid gap-1.5">
              <Label htmlFor="historical-order">Orden del pack</Label>
              <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                <SelectTrigger id="historical-order" aria-label="Orden de Mercado Libre">
                  <SelectValue placeholder="Selecciona una orden pagada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {inspection.orders.map((order) => (
                      <SelectItem key={order.externalOrderId} value={order.externalOrderId}>
                        {order.externalOrderId} · {getRawOrderStatusMeta(order.status).label} ·{" "}
                        {formatSaleAmount(order.totalAmount)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {selectedOrder ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <TintBadge
                  label={getRawOrderStatusMeta(selectedOrder.status).label}
                  tone={RAW_STATUS_TONE[selectedOrder.status.toLowerCase()] ?? "slate"}
                />
                {selectedOrder.alreadyImported ? (
                  <TintBadge label="Ya registrada en P de Papel" tone="slate" />
                ) : null}
                <span className="text-sm text-muted-foreground">
                  {selectedOrder.externalOrderId} · {formatSaleDate(selectedOrder.paidAt)}
                </span>
              </div>
              {selectedOrder.alreadyImported ? (
                <p className="text-sm text-muted-foreground">
                  Esta venta ya existe arriba en la lista. Si su inventario no se aplicó, usa
                  «Re-sincronizar» en su fila; no hace falta importarla.
                </p>
              ) : null}
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                {selectedOrder.items.map((item) => {
                  const product = item.linkedProduct ?? item.suggestedProduct;
                  const short = product ? product.stock < item.quantity : false;
                  return (
                    <div key={`${item.externalItemId}-${item.title}`} className="rounded-md border bg-background p-3">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-muted-foreground">
                        {item.quantity} × {formatSaleAmount(item.unitPrice)}
                      </p>
                      {product ? (
                        <p className="mt-2 text-xs">
                          <span className="text-muted-foreground">Producto local:</span> {product.name} ·{" "}
                          <span className={short ? "font-semibold text-destructive" : "text-muted-foreground"}>
                            stock actual {product.stock}
                            {short ? " (insuficiente para importar)" : ""}
                          </span>
                          {!item.linkedProduct ? (
                            <span className="block text-muted-foreground">
                              Se creará la publicación vinculada al importar.
                            </span>
                          ) : null}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-destructive">
                          Sin vínculo local. Verifica que el SKU de Mercado Libre sea igual al SKU del producto.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {!selectedOrder.alreadyImported && selectedOrder.status === "paid" ? (
                <div className="space-y-3 rounded-md border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Cargos de la venta</p>
                      <p className="text-xs text-muted-foreground">
                        Tráelos de la facturación de Mercado Libre o cópialos del resumen de la venta. El neto se
                        calcula automáticamente.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void prefillCharges()}
                      disabled={isPrefilling}
                    >
                      {isPrefilling ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Download className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Traer cargos de Mercado Libre
                    </Button>
                  </div>
                  {prefillNote ? (
                    <p className="text-xs text-muted-foreground" role="status">
                      {prefillNote}
                    </p>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="historical-fee">Cargo por venta</Label>
                      <CurrencyInput
                        id="historical-fee"
                        value={toCurrencyInputValue(marketplaceFee)}
                        onChange={(value) => setMarketplaceFee(value === undefined ? "" : String(value))}
                        inputMode="numeric"
                        placeholder="0"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="historical-shipping">Envío a cargo tuyo</Label>
                      <CurrencyInput
                        id="historical-shipping"
                        value={toCurrencyInputValue(shippingCost)}
                        onChange={(value) => setShippingCost(value === undefined ? "" : String(value))}
                        inputMode="numeric"
                        placeholder="0"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="historical-taxes">Impuestos</Label>
                      <CurrencyInput
                        id="historical-taxes"
                        value={toCurrencyInputValue(taxesAmount)}
                        onChange={(value) => setTaxesAmount(value === undefined ? "" : String(value))}
                        inputMode="numeric"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>Cobrado al comprador: {formatSaleAmount(selectedOrder.totalAmount)}</span>
                    <span className="font-semibold text-primary">
                      Neto: {calculatedNet === null ? "—" : formatSaleAmount(calculatedNet)}
                      {calculatedNet !== null && calculatedNet < 0 ? (
                        <span className="ml-1 text-destructive">(los cargos superan el total)</span>
                      ) : null}
                    </span>
                  </div>
                  <Button
                    type="button"
                    onClick={() => void reconcileSale()}
                    disabled={
                      isReconciling ||
                      !hasMappedItems ||
                      !hasFinancialDetails ||
                      calculatedNet === null ||
                      calculatedNet < 0
                    }
                  >
                    {isReconciling ? "Importando…" : "Importar venta pagada"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {confirmationDialog}
    </SectionCard>
  );
}
