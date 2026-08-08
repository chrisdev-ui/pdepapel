"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MercadoLibreLogo } from "@/components/mercadolibre-logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle2, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type HistoricalSaleItem = {
  externalItemId: string;
  title: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  linkedProduct: ProductReference | null;
  suggestedProduct: ProductReference | null;
};

type ProductReference = {
  id: string;
  name: string;
  sku: string;
  stock: number;
};

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
    items: HistoricalSaleItem[];
  }[];
};

type MarketplaceSale = {
  id: string;
  externalOrderId: string;
  externalPackId: string | null;
  status: string;
  inventoryStatus: string;
  paidAt: string | null;
  totalAmount: number | null;
  marketplaceFee: number | null;
  shippingCost: number | null;
  netAmount: number | null;
  metadata: {
    taxesAmount?: number;
    financials?: { moneyReleaseStatus?: string | null; status?: string };
  } | null;
  items: {
    title: string;
    quantity: number;
    unitPrice: number;
    product: { name: string; sku: string } | null;
  }[];
};

type SalesResponse = {
  data: MarketplaceSale[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number | null) {
  return value === null || !Number.isFinite(value)
    ? "—"
    : currencyFormatter.format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

function getErrorMessage(response: Response) {
  return response
    .json()
    .then(
      (body: { error?: string }) =>
        body.error ?? "No fue posible completar la acción",
    )
    .catch(() => "No fue posible completar la acción");
}

function getTaxesAmount(metadata: MarketplaceSale["metadata"]) {
  const amount = Number(metadata?.taxesAmount);
  return Number.isFinite(amount) ? amount : null;
}

function getSettlementLabel(sale: MarketplaceSale) {
  if (sale.netAmount === null) {
    return "Liquidación pendiente de Mercado Libre";
  }
  if (sale.metadata?.financials?.moneyReleaseStatus === "released") {
    return "Liquidación liberada por Mercado Libre";
  }
  return "Neto confirmado por Mercado Libre";
}

export function MercadoLibreHistoricalSales({
  storeId,
  canReconcile,
  highlightedOrderId,
}: {
  storeId: string;
  canReconcile: boolean;
  highlightedOrderId: string | null;
}) {
  const [reference, setReference] = useState("");
  const [inspection, setInspection] = useState<HistoricalSaleInspection | null>(
    null,
  );
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [marketplaceFee, setMarketplaceFee] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [taxesAmount, setTaxesAmount] = useState("");
  const [isInspecting, setIsInspecting] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);
  const [sales, setSales] = useState<SalesResponse | null>(null);
  const [isLoadingSales, setIsLoadingSales] = useState(true);

  const loadSales = useCallback(
    async (page = 1) => {
      setIsLoadingSales(true);
      try {
        const response = await fetch(
          `/api/${storeId}/marketplaces/mercadolibre/historical-sales?page=${page}&pageSize=10`,
        );
        if (!response.ok) throw new Error(await getErrorMessage(response));
        setSales((await response.json()) as SalesResponse);
      } catch (error) {
        setFeedback({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "No fue posible cargar las ventas conciliadas",
        });
      } finally {
        setIsLoadingSales(false);
      }
    },
    [storeId],
  );

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  useEffect(() => {
    if (
      !highlightedOrderId ||
      !sales?.data.some((sale) => sale.id === highlightedOrderId)
    ) {
      return;
    }
    document
      .getElementById(`mercadolibre-order-${highlightedOrderId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedOrderId, sales]);

  const selectedOrder = useMemo(
    () =>
      inspection?.orders.find(
        (order) => order.externalOrderId === selectedOrderId,
      ) ?? null,
    [inspection, selectedOrderId],
  );
  const calculatedNet = selectedOrder
    ? selectedOrder.totalAmount -
      Number(marketplaceFee || 0) -
      Number(shippingCost || 0) -
      Number(taxesAmount || 0)
    : null;
  const hasMappedItems = Boolean(
    selectedOrder?.items.every(
      (item) => item.linkedProduct || item.suggestedProduct,
    ),
  );
  const hasFinancialDetails =
    marketplaceFee !== "" && shippingCost !== "" && taxesAmount !== "";

  const inspectSale = async () => {
    if (!reference.trim()) {
      setFeedback({
        type: "error",
        message: "Ingresa el número de venta u orden",
      });
      return;
    }
    setIsInspecting(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/historical-sales/inspect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: reference.trim() }),
        },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const result = (await response.json()) as HistoricalSaleInspection;
      setInspection(result);
      const firstPendingOrder = result.orders.find(
        (order) => order.status === "paid" && !order.alreadyImported,
      );
      setSelectedOrderId(firstPendingOrder?.externalOrderId ?? "");
      setMarketplaceFee("");
      setShippingCost("");
      setTaxesAmount("");
    } catch (error) {
      setInspection(null);
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "No fue posible revisar la venta de Mercado Libre",
      });
    } finally {
      setIsInspecting(false);
    }
  };

  const reconcileSale = async () => {
    if (!selectedOrder || !hasMappedItems || !hasFinancialDetails) return;
    if (calculatedNet === null || calculatedNet < 0) {
      setFeedback({
        type: "error",
        message: "Los cargos no pueden ser mayores al total de la venta",
      });
      return;
    }
    if (
      !window.confirm(
        `¿Registrar la venta ${selectedOrder.externalOrderId} y descontar su inventario una sola vez?`,
      )
    ) {
      return;
    }

    setIsReconciling(true);
    setFeedback(null);
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
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setFeedback({
        type: "success",
        message:
          "Venta conciliada. El inventario y la sincronización con Mercado Libre quedaron registrados.",
      });
      await loadSales(1);
      setInspection(null);
      setSelectedOrderId("");
      setReference("");
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "No fue posible conciliar la venta de Mercado Libre",
      });
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MercadoLibreLogo className="h-5" />
          Ventas de Mercado Libre
        </CardTitle>
        <CardDescription>
          Revisa ventas anteriores sin modificar stock. Solo concilia una venta
          pagada después de confirmar sus cargos y productos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!canReconcile ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Conecta Mercado Libre y activa el procesamiento seguro antes de
            conciliar ventas anteriores.
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Número de venta o pack de Mercado Libre"
              inputMode="numeric"
            />
            <Button
              type="button"
              onClick={() => void inspectSale()}
              disabled={isInspecting}
            >
              {isInspecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Revisar venta
            </Button>
          </div>
        )}

        {inspection ? (
          <div className="space-y-4 rounded-md border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">
                {inspection.referenceType === "pack" ? "Pack" : "Orden"}
              </Badge>
              {inspection.pack ? <span>Pack {inspection.pack.id}</span> : null}
              <span className="text-muted-foreground">
                Esta revisión todavía no cambia inventario.
              </span>
            </div>
            {inspection.orders.length > 1 ? (
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedOrderId}
                onChange={(event) => setSelectedOrderId(event.target.value)}
              >
                <option value="">Selecciona una orden pagada</option>
                {inspection.orders.map((order) => (
                  <option
                    key={order.externalOrderId}
                    value={order.externalOrderId}
                  >
                    {order.externalOrderId} · {order.status} ·{" "}
                    {formatCurrency(order.totalAmount)}
                  </option>
                ))}
              </select>
            ) : null}
            {selectedOrder ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      selectedOrder.status === "paid" ? "success" : "secondary"
                    }
                  >
                    {selectedOrder.status === "paid"
                      ? "Pagada"
                      : selectedOrder.status}
                  </Badge>
                  {selectedOrder.alreadyImported ? (
                    <Badge variant="secondary">Ya conciliada</Badge>
                  ) : null}
                  <span className="text-sm text-muted-foreground">
                    {selectedOrder.externalOrderId} ·{" "}
                    {formatDate(selectedOrder.paidAt)}
                  </span>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  {selectedOrder.items.map((item) => {
                    const product = item.linkedProduct ?? item.suggestedProduct;
                    return (
                      <div
                        key={`${item.externalItemId}-${item.title}`}
                        className="rounded-md border bg-background p-3"
                      >
                        <p className="font-medium">{item.title}</p>
                        <p className="text-muted-foreground">
                          {item.quantity} × {formatCurrency(item.unitPrice)}
                        </p>
                        {product ? (
                          <p className="mt-2 text-success">
                            Producto local: {product.name} · Stock actual:{" "}
                            {product.stock}
                          </p>
                        ) : (
                          <p className="mt-2 text-destructive">
                            Sin vínculo local. Verifica que el SKU de Mercado
                            Libre sea igual al SKU del producto.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!selectedOrder.alreadyImported &&
                selectedOrder.status === "paid" ? (
                  <div className="space-y-3 rounded-md border bg-background p-4">
                    <p className="text-sm font-medium">
                      Resumen financiero de Mercado Libre
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Copia los tres cargos del resumen de la venta. El neto se
                      calcula automáticamente.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Input
                        value={marketplaceFee}
                        onChange={(event) =>
                          setMarketplaceFee(event.target.value)
                        }
                        inputMode="decimal"
                        placeholder="Cargo por venta"
                      />
                      <Input
                        value={shippingCost}
                        onChange={(event) =>
                          setShippingCost(event.target.value)
                        }
                        inputMode="decimal"
                        placeholder="Envíos"
                      />
                      <Input
                        value={taxesAmount}
                        onChange={(event) => setTaxesAmount(event.target.value)}
                        inputMode="decimal"
                        placeholder="Impuestos"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        Total cobrado:{" "}
                        {formatCurrency(selectedOrder.totalAmount)}
                      </span>
                      <span
                        className={
                          calculatedNet !== null && calculatedNet >= 0
                            ? "font-semibold text-success"
                            : "font-semibold text-destructive"
                        }
                      >
                        Neto recibido: {formatCurrency(calculatedNet)}
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
                      {isReconciling
                        ? "Conciliando…"
                        : "Conciliar venta pagada"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {feedback ? (
          <div
            className={
              feedback.type === "error"
                ? "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                : "flex items-start gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success"
            }
            role={feedback.type === "error" ? "alert" : "status"}
          >
            {feedback.type === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p>{feedback.message}</p>
          </div>
        ) : null}

        <div id="mercadolibre-orders" className="space-y-3 border-t pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Ventas registradas</p>
              <p className="text-sm text-muted-foreground">
                {sales?.total ?? 0} ventas importadas o recibidas desde Mercado
                Libre.
              </p>
            </div>
            {isLoadingSales ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
          </div>
          {sales?.data.length ? (
            <div className="space-y-2">
              {sales.data.map((sale) => (
                <div
                  key={sale.id}
                  id={`mercadolibre-order-${sale.id}`}
                  className={
                    sale.id === highlightedOrderId
                      ? "scroll-mt-6 rounded-md border border-amber-400 bg-amber-50/40 p-3 text-sm"
                      : "scroll-mt-6 rounded-md border p-3 text-sm"
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          sale.status === "PAID" ? "success" : "secondary"
                        }
                      >
                        {sale.status}
                      </Badge>
                      <span className="font-medium">
                        Orden {sale.externalOrderId}
                      </span>
                    </div>
                    <span>{formatDate(sale.paidAt)}</span>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    {sale.items
                      .map(
                        (item) =>
                          `${item.quantity} × ${item.product?.name ?? item.title}`,
                      )
                      .join(" · ")}
                  </p>
                  <div className="mt-3 grid gap-2 rounded-md bg-muted/50 p-2.5 text-xs sm:grid-cols-4">
                    <div className="sm:order-4">
                      <span className="block text-muted-foreground">
                        Cobrado al cliente
                      </span>
                      <span>{formatCurrency(sale.totalAmount)}</span>
                    </div>
                    <div className="sm:order-2">
                      <span className="block text-muted-foreground">
                        Cargos Mercado Libre
                      </span>
                      <span>{formatCurrency(sale.marketplaceFee)}</span>
                    </div>
                    <div className="sm:order-3">
                      <span className="block text-muted-foreground">
                        Envíos e impuestos
                      </span>
                      <span>
                        {formatCurrency(
                          (sale.shippingCost ?? 0) +
                            (getTaxesAmount(sale.metadata) ?? 0),
                        )}
                      </span>
                    </div>
                    <div className="sm:order-1">
                      <span className="block text-muted-foreground">
                        Neto para P de Papel
                      </span>
                      <span
                        className={
                          sale.netAmount === null
                            ? "font-medium text-amber-700"
                            : "font-semibold text-success"
                        }
                      >
                        {sale.netAmount === null
                          ? "Pendiente"
                          : formatCurrency(sale.netAmount)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {getSettlementLabel(sale)}
                  </p>
                </div>
              ))}
              {sales.pageCount > 1 ? (
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={sales.page <= 1 || isLoadingSales}
                    onClick={() => void loadSales(sales.page - 1)}
                  >
                    Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Página {sales.page} de {sales.pageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={sales.page >= sales.pageCount || isLoadingSales}
                    onClick={() => void loadSales(sales.page + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              ) : null}
            </div>
          ) : !isLoadingSales ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay ventas de Mercado Libre registradas.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
