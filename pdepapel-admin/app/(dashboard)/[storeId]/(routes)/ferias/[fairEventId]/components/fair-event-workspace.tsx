"use client";

import axios from "axios";
import {
  ArrowLeft,
  Banknote,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Loader2,
  PackageCheck,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  printQrLabelSheet,
  QrLabelPrintSheet,
  type QrPrintLabel,
} from "@/components/labels/qr-label-print-sheet";
import { SellPanel, type SellSource } from "@/components/sales/sell-panel";
import { AsyncProductSelect } from "@/components/ui/async-product-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PercentageInput } from "@/components/ui/percentage-input";
import { QuantitySelector } from "@/components/ui/quantity-selector";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { useToast } from "@/hooks/use-toast";
import { LABEL_PRINT_FORMATS } from "@/lib/label-printing";

import { FairPhaseHeader } from "./fair-phase-header";

type FairStatus = "DRAFT" | "OPEN" | "RECONCILING" | "CLOSED" | "CANCELLED";

type FairProduct = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  price: number;
  acqPrice: number | null;
  gtin: string | null;
  images: { url: string }[];
};

type FairInventoryItem = {
  id: string;
  productId: string;
  allocatedQuantity: number;
  soldQuantity: number;
  packedQuantity: number;
  returnedQuantity: number;
  damagedQuantity: number;
  lostQuantity: number;
  product: FairProduct;
};

type FairCapsule = {
  id: string;
  code: string;
  salePrice: number;
  productCost: number;
  minimumMarginPct: number;
  status: "PACKED" | "SOLD" | "VOID";
  product: { id: string; name: string; sku: string };
};

type FairOrder = {
  id: string;
  orderNumber: string;
  total: number;
  createdAt: string;
  payment: { method: "CASH" | "BankTransfer" } | null;
  orderItems: { id: string; name: string; quantity: number; price: number }[];
};

export type FairEventDetail = {
  id: string;
  name: string;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: FairStatus;
  notes: string | null;
  openedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
  inventoryItems: FairInventoryItem[];
  capsules: FairCapsule[];
  orders: FairOrder[];
};

type PendingAllocation = {
  product: Pick<FairProduct, "id" | "name" | "sku" | "stock"> & {
    isKit?: boolean;
  };
  quantity: number;
};

type ReconciliationInput = {
  returnedQuantity: number;
  damagedQuantity: number;
  lostQuantity: number;
};

type GeneratedCapsule = {
  id: string;
  code: string;
};

const statusLabels: Record<FairStatus, string> = {
  DRAFT: "Preparación",
  OPEN: "Abierta",
  RECONCILING: "Conciliando",
  CLOSED: "Cerrada",
  CANCELLED: "Cancelada",
};

const statusVariants: Record<
  FairStatus,
  "default" | "secondary" | "success" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  OPEN: "success",
  RECONCILING: "outline",
  CLOSED: "default",
  CANCELLED: "destructive",
};

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || fallback;
  }
  return fallback;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getAvailableFairStock(item: FairInventoryItem) {
  return (
    item.allocatedQuantity -
    item.soldQuantity -
    item.packedQuantity -
    item.returnedQuantity -
    item.damagedQuantity -
    item.lostQuantity
  );
}

export function FairEventWorkspace({ event }: { event: FairEventDetail }) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [pendingProduct, setPendingProduct] = useState<
    PendingAllocation["product"] | null
  >(null);
  const [pendingQuantity, setPendingQuantity] = useState(1);
  const [pendingAllocations, setPendingAllocations] = useState<
    PendingAllocation[]
  >([]);
  const [isAllocating, setIsAllocating] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [capsuleProductId, setCapsuleProductId] = useState("");
  const [capsuleQuantity, setCapsuleQuantity] = useState(1);
  const [capsulePrice, setCapsulePrice] = useState(0);
  const [minimumMarginPct, setMinimumMarginPct] = useState(30);
  const [isPackingCapsules, setIsPackingCapsules] = useState(false);
  const [generatedCapsules, setGeneratedCapsules] = useState<
    GeneratedCapsule[]
  >([]);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isCloseConfirmationOpen, setIsCloseConfirmationOpen] = useState(false);
  const [reconciliation, setReconciliation] = useState<
    Record<string, ReconciliationInput>
  >({});

  const eventItemsByProduct = useMemo(
    () => new Map(event.inventoryItems.map((item) => [item.productId, item])),
    [event.inventoryItems],
  );
  const totalAllocated = event.inventoryItems.reduce(
    (total, item) => total + item.allocatedQuantity,
    0,
  );
  const totalSold = event.inventoryItems.reduce(
    (total, item) => total + item.soldQuantity,
    0,
  );
  const salesTotal = event.orders.reduce(
    (total, order) => total + order.total,
    0,
  );
  const availableItems = event.inventoryItems.filter(
    (item) => getAvailableFairStock(item) > 0,
  );
  const packedCapsules = event.capsules.filter(
    (capsule) => capsule.status === "PACKED",
  );
  const printableCapsuleLabels = useMemo<QrPrintLabel[]>(
    () =>
      generatedCapsules.map((capsule) => ({
        id: capsule.id,
        code: capsule.code,
        title: "Cápsula sorpresa",
        subtitle: capsule.code,
      })),
    [generatedCapsules],
  );
  const selectedCapsuleProduct = eventItemsByProduct.get(capsuleProductId);
  const calculatedCapsuleMargin =
    selectedCapsuleProduct?.product.acqPrice && capsulePrice > 0
      ? ((capsulePrice - selectedCapsuleProduct.product.acqPrice) /
          capsulePrice) *
        100
      : null;

  useEffect(() => {
    setReconciliation(
      Object.fromEntries(
        event.inventoryItems.map((item) => [
          item.productId,
          {
            returnedQuantity: item.allocatedQuantity - item.soldQuantity,
            damagedQuantity: 0,
            lostQuantity: 0,
          },
        ]),
      ),
    );
  }, [event.id, event.updatedAt, event.inventoryItems]);

  function addPendingAllocation() {
    if (!pendingProduct) {
      toast({ title: "Selecciona un producto", variant: "destructive" });
      return;
    }
    if (pendingQuantity > pendingProduct.stock) {
      toast({
        title: "No hay suficiente inventario disponible",
        description: `${pendingProduct.name} tiene ${pendingProduct.stock} unidades disponibles en la tienda en línea.`,
        variant: "destructive",
      });
      return;
    }

    setPendingAllocations((current) => {
      const existing = current.find(
        (item) => item.product.id === pendingProduct.id,
      );
      if (!existing) {
        return [
          ...current,
          { product: pendingProduct, quantity: pendingQuantity },
        ];
      }
      const totalQuantity = existing.quantity + pendingQuantity;
      if (totalQuantity > pendingProduct.stock) {
        toast({
          title: "No hay suficiente inventario disponible",
          description: `${pendingProduct.name} tiene ${pendingProduct.stock} unidades disponibles en la tienda en línea.`,
          variant: "destructive",
        });
        return current;
      }
      return current.map((item) =>
        item.product.id === pendingProduct.id
          ? { ...item, quantity: totalQuantity }
          : item,
      );
    });
    setPendingProduct(null);
    setPendingQuantity(1);
  }

  async function submitAllocations() {
    if (pendingAllocations.length === 0) {
      toast({
        title: "Agrega productos para reservar",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsAllocating(true);
      await axios.post(
        `/api/${params.storeId}/fair-events/${event.id}/allocation`,
        {
          allocations: pendingAllocations.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
        },
      );
      setPendingAllocations([]);
      toast({
        title: "Inventario reservado",
        description:
          "Estas unidades ya no se muestran disponibles para venta en línea.",
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "No se pudo reservar el inventario",
        description: getErrorMessage(error, "Intenta de nuevo."),
        variant: "destructive",
      });
    } finally {
      setIsAllocating(false);
    }
  }

  async function openFair() {
    try {
      setIsOpening(true);
      await axios.post(`/api/${params.storeId}/fair-events/${event.id}/open`);
      toast({
        title: "Feria abierta para ventas",
        description: "Desde ahora puedes registrar ventas desde este celular.",
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "No se pudo abrir la feria",
        description: getErrorMessage(error, "Intenta de nuevo."),
        variant: "destructive",
      });
    } finally {
      setIsOpening(false);
    }
  }

  async function packCapsules() {
    if (!capsuleProductId || capsuleQuantity < 1 || capsulePrice <= 0) {
      toast({
        title: "Completa los datos de la cápsula",
        description: "Selecciona un producto, cantidad y precio de venta.",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsPackingCapsules(true);
      const response = await axios.post(
        `/api/${params.storeId}/fair-events/${event.id}/capsules`,
        {
          productId: capsuleProductId,
          quantity: capsuleQuantity,
          salePrice: capsulePrice,
          minimumMarginPct,
        },
      );
      setGeneratedCapsules(
        response.data.map((capsule: GeneratedCapsule) => ({
          id: capsule.id,
          code: capsule.code,
        })),
      );
      toast({
        title: "Cápsulas empacadas",
        description: "Imprime o guarda los QR antes de sellarlas.",
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "No se pudieron empacar las cápsulas",
        description: getErrorMessage(
          error,
          "Revisa el inventario y el margen mínimo.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsPackingCapsules(false);
    }
  }

  function updateReconciliation(
    productId: string,
    field: keyof ReconciliationInput,
    value: number,
  ) {
    setReconciliation((current) => ({
      ...current,
      [productId]: {
        ...current[productId],
        [field]: value,
      },
    }));
  }

  const hasBalancedReconciliation = event.inventoryItems.every((item) => {
    const values = reconciliation[item.productId];
    if (!values) return false;
    return (
      values.returnedQuantity + values.damagedQuantity + values.lostQuantity ===
      item.allocatedQuantity - item.soldQuantity
    );
  });

  async function reconcileFair() {
    if (!hasBalancedReconciliation) {
      toast({
        title: "La conciliación no cuadra",
        description:
          "Cada producto debe sumar exactamente las unidades no vendidas.",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsReconciling(true);
      await axios.post(
        `/api/${params.storeId}/fair-events/${event.id}/reconcile`,
        {
          items: event.inventoryItems.map((item) => ({
            productId: item.productId,
            ...reconciliation[item.productId],
          })),
        },
      );
      toast({
        title: "Feria conciliada y cerrada",
        description:
          "Las unidades devueltas regresaron al inventario de la tienda en línea.",
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "No se pudo cerrar la feria",
        description: getErrorMessage(
          error,
          "Revisa el conteo y vuelve a intentar.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsReconciling(false);
    }
  }

  const canOperate = event.status === "DRAFT" || event.status === "OPEN";

  // Fuente de la pantalla de venta compartida: solo productos reservados en la feria y cápsulas con QR.
  const fairSellSource = useMemo<SellSource>(
    () => ({
      lookup: async (code) => {
        const response = await axios.get(
          `/api/${params.storeId}/fair-events/${event.id}/lookup`,
          { params: { code } },
        );
        if (response.data.kind === "capsule") {
          const capsuleCode = String(response.data.code).toUpperCase();
          return {
            key: `capsule-${capsuleCode}`,
            productId: null,
            name: "Cápsula sorpresa",
            detail: capsuleCode,
            price: Number(response.data.salePrice),
            quantity: 1,
            maxQuantity: 1,
            fixedQuantity: true,
          };
        }
        const product = response.data.product as FairProduct;
        const eventItem = eventItemsByProduct.get(product.id);
        return {
          key: `product-${product.id}`,
          productId: product.id,
          name: product.name,
          detail: `SKU ${product.sku} · ${eventItem ? getAvailableFairStock(eventItem) : 0} reservadas`,
          price: Number(product.price),
          quantity: 1,
          maxQuantity: eventItem ? getAvailableFairStock(eventItem) : 0,
          imageUrl: product.images?.[0]?.url ?? null,
        };
      },
      submit: async ({ lines, paymentMethod, idempotencyKey }) => {
        const response = await axios.post(
          `/api/${params.storeId}/fair-events/${event.id}/sales`,
          {
            items: lines.map((line) =>
              line.productId === null
                ? { capsuleCode: line.detail }
                : { productId: line.productId, quantity: line.quantity },
            ),
            paymentMethod,
            idempotencyKey,
          },
        );
        return {
          orderNumber: response.data.order.orderNumber as string,
          duplicate: Boolean(response.data.duplicate),
        };
      },
      renderPicker: (add) => (
        <Select
          value=""
          onValueChange={(productId) => {
            const selected = eventItemsByProduct.get(productId);
            if (!selected) return;
            add({
              key: `product-${selected.productId}`,
              productId: selected.productId,
              name: selected.product.name,
              detail: `SKU ${selected.product.sku} · ${getAvailableFairStock(selected)} reservadas`,
              price: selected.product.price,
              quantity: 1,
              maxQuantity: getAvailableFairStock(selected),
              imageUrl: selected.product.images?.[0]?.url ?? null,
            });
          }}
        >
          <SelectTrigger id="fair-product" aria-label="Producto reservado">
            <SelectValue placeholder="Seleccionar producto reservado" />
          </SelectTrigger>
          <SelectContent>
            {availableItems.map((item) => (
              <SelectItem key={item.id} value={item.productId}>
                {item.product.name} ({getAvailableFairStock(item)} disponibles)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
      copy: {
        addDescription:
          "Escanea la etiqueta del producto o el QR de la cápsula. Solo se venden unidades reservadas para esta feria.",
        pickerLabel: "Producto reservado",
        scannerDescription:
          "Apunta la cámara a la etiqueta del producto o al QR de la cápsula.",
        confirmNote:
          "Cada venta queda como pedido pagado. Si falta reserva, no se registra ni descuenta parcialmente.",
      },
    }),
    [availableItems, event.id, eventItemsByProduct, params.storeId],
  );

  return (
    <div className="space-y-6">
      <FairPhaseHeader
        storeId={String(params.storeId)}
        name={event.name}
        status={event.status}
        location={event.location}
        startsAt={event.startsAt}
        endsAt={event.endsAt}
        allocated={totalAllocated}
        sold={totalSold}
        action={
          event.status === "DRAFT" ? (
            <Button
              type="button"
              onClick={openFair}
              disabled={event.inventoryItems.length === 0}
              isLoading={isOpening}
            >
              {!isOpening && (
                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Abrir para ventas
            </Button>
          ) : null
        }
      />
      {event.notes && (
        <p className="text-sm text-muted-foreground">{event.notes}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Boxes
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="text-2xl font-bold">{totalAllocated}</p>
              <p className="text-xs text-muted-foreground">
                Unidades reservadas
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <PackageCheck
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="text-2xl font-bold">{totalSold}</p>
              <p className="text-xs text-muted-foreground">Unidades vendidas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CircleDollarSign
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="text-2xl font-bold">{formatCurrency(salesTotal)}</p>
              <p className="text-xs text-muted-foreground">
                Ventas registradas
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <PackageCheck
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="text-2xl font-bold">{event.capsules.length}</p>
              <p className="text-xs text-muted-foreground">Cápsulas sorpresa</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {event.status === "DRAFT" && (
        <Card id="inventario" className="scroll-mt-24">
          <CardHeader>
            <CardTitle>Reservar inventario</CardTitle>
            <CardDescription>
              Las unidades se descuentan ahora de la tienda en línea. Nunca
              lleves producto sin asignarlo primero a esta feria.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_auto] sm:items-end">
              <div className="grid gap-2">
                <Label>Producto</Label>
                <AsyncProductSelect
                  value={pendingProduct?.id ?? ""}
                  onChange={(_value, product) => {
                    if (!product) return;
                    if (product.isKit) {
                      toast({
                        title: "Reserva los productos físicos del kit",
                        description:
                          "Los kits calculan su inventario desde sus componentes y no se reservan directamente para una feria.",
                        variant: "destructive",
                      });
                      return;
                    }
                    setPendingProduct({
                      id: product.id,
                      name: product.name,
                      sku: product.sku,
                      stock: product.stock,
                      isKit: product.isKit,
                    });
                  }}
                  placeholder="Busca por nombre, SKU o código"
                  modal
                  ariaLabel="Producto para reservar"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="allocation-quantity">Cantidad</Label>
                <StockQuantityInput
                  id="allocation-quantity"
                  min={1}
                  value={pendingQuantity}
                  onChange={setPendingQuantity}
                  ariaLabel="Cantidad para reservar"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={addPendingAllocation}
              >
                <Plus className="mr-2 h-4 w-4" />
                Agregar
              </Button>
            </div>

            {pendingAllocations.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3">
                {pendingAllocations.map((allocation) => (
                  <div
                    key={allocation.product.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {allocation.product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        SKU: {allocation.product.sku}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span>{allocation.quantity} und.</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setPendingAllocations((current) =>
                            current.filter(
                              (item) =>
                                item.product.id !== allocation.product.id,
                            ),
                          )
                        }
                        aria-label={`Quitar ${allocation.product.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {event.inventoryItems.length > 0
                  ? `${totalAllocated} unidades ya están reservadas para esta feria.`
                  : "Aún no hay unidades reservadas."}
              </p>
              <Button
                onClick={submitAllocations}
                disabled={isAllocating || pendingAllocations.length === 0}
              >
                {isAllocating && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Reservar en inventario
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {canOperate && event.inventoryItems.length > 0 && (
        <Card id="capsulas" className="scroll-mt-24">
          <CardHeader>
            <CardTitle>Cápsulas sorpresa (opcional)</CardTitle>
            <CardDescription>
              Empaca productos ya reservados y genera un QR único. El costo y el
              margen mínimo se validan antes de crear cada cápsula.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="capsule-product">Producto reservado</Label>
                <Select
                  value={capsuleProductId}
                  onValueChange={setCapsuleProductId}
                >
                  <SelectTrigger id="capsule-product">
                    <SelectValue placeholder="Seleccionar producto" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableItems.map((item) => (
                      <SelectItem key={item.id} value={item.productId}>
                        {item.product.name} ({getAvailableFairStock(item)}{" "}
                        disponibles)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="capsule-quantity">Cantidad</Label>
                <StockQuantityInput
                  id="capsule-quantity"
                  min={1}
                  value={capsuleQuantity}
                  onChange={setCapsuleQuantity}
                  ariaLabel="Cantidad de cápsulas"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="capsule-price">Precio de venta</Label>
                <CurrencyInput
                  id="capsule-price"
                  min={0}
                  value={capsulePrice || undefined}
                  onChange={(value) => setCapsulePrice(value || 0)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
              <div className="text-sm text-muted-foreground">
                {selectedCapsuleProduct?.product.acqPrice &&
                capsulePrice > 0 ? (
                  <p>
                    Costo unitario:{" "}
                    {formatCurrency(selectedCapsuleProduct.product.acqPrice)} ·
                    Margen estimado:{" "}
                    {calculatedCapsuleMargin?.toFixed(1) || "0.0"}%
                  </p>
                ) : (
                  <p>
                    Selecciona un producto con costo de adquisición y escribe el
                    precio de venta.
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="capsule-margin">Margen mínimo (%)</Label>
                <PercentageInput
                  id="capsule-margin"
                  min={0}
                  max={99.99}
                  step="0.01"
                  value={minimumMarginPct || undefined}
                  onChange={(value) => setMinimumMarginPct(value || 0)}
                />
              </div>
              <Button
                onClick={packCapsules}
                disabled={isPackingCapsules || availableItems.length === 0}
              >
                {isPackingCapsules && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <QrCode className="mr-2 h-4 w-4" />
                Crear QR
              </Button>
            </div>
            {packedCapsules.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {packedCapsules.length} cápsulas empacadas y disponibles para
                venta.
              </p>
            )}

            {generatedCapsules.length > 0 && (
              <div className="rounded-lg border border-dashed p-4">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">Etiquetas listas</p>
                    <p className="text-sm text-muted-foreground">
                      Pon un QR en cada cápsula sellada; el contenido no aparece
                      en la etiqueta.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {LABEL_PRINT_FORMATS.STANDARD_40.description}. Este
                      formato protege la lectura de códigos únicos.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (!printQrLabelSheet("capsule")) {
                        toast({
                          title: "No se pudo abrir la impresión",
                          description:
                            "Permite las ventanas emergentes e inténtalo de nuevo.",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Imprimir etiquetas
                  </Button>
                </div>
                <QrLabelPrintSheet
                  target="capsule"
                  labels={printableCapsuleLabels}
                  format="STANDARD_40"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {event.status === "OPEN" && (
        <Card id="ventas" className="scroll-mt-24 border-primary/30">
          <CardHeader>
            <CardTitle>Registrar venta</CardTitle>
            <CardDescription>
              Escanea el código, revisa el total y marca el pago. Cada venta se
              registra como pedido pagado en este momento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SellPanel
              source={fairSellSource}
              embedded
              submitErrorHint="No se cobró la venta; revisa el inventario de feria e intenta de nuevo."
            />
          </CardContent>
        </Card>
      )}

      {event.status === "OPEN" && (
        <Card id="cierre" className="scroll-mt-24">
          <CardHeader>
            <CardTitle>Conciliar y cerrar</CardTitle>
            <CardDescription>
              Al terminar, cuenta todo lo no vendido. Solo las unidades
              devueltas se reintegran a la tienda en línea.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="hidden grid-cols-[minmax(0,1fr)_90px_90px_90px_90px] gap-3 px-2 text-xs font-medium text-muted-foreground md:grid">
              <span>Producto</span>
              <span>Por contar</span>
              <span>Devuelto</span>
              <span>Daño</span>
              <span>Pérdida</span>
            </div>
            {event.inventoryItems.map((item) => {
              const values = reconciliation[item.productId] || {
                returnedQuantity: 0,
                damagedQuantity: 0,
                lostQuantity: 0,
              };
              const expected = item.allocatedQuantity - item.soldQuantity;
              const entered =
                values.returnedQuantity +
                values.damagedQuantity +
                values.lostQuantity;
              return (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_90px_90px_90px_90px] md:items-center md:border-0 md:p-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Vendidos: {item.soldQuantity} · Empacados:{" "}
                      {item.packedQuantity}
                    </p>
                  </div>
                  <p className="text-sm font-semibold md:text-center">
                    {expected} und.
                  </p>
                  <div className="grid gap-1">
                    <Label className="text-xs md:sr-only">Devuelto</Label>
                    <StockQuantityInput
                      min={0}
                      value={values.returnedQuantity}
                      onChange={(quantity) =>
                        updateReconciliation(
                          item.productId,
                          "returnedQuantity",
                          quantity,
                        )
                      }
                      ariaLabel={`Cantidad devuelta de ${item.product.name}`}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs md:sr-only">Daño</Label>
                    <StockQuantityInput
                      min={0}
                      value={values.damagedQuantity}
                      onChange={(quantity) =>
                        updateReconciliation(
                          item.productId,
                          "damagedQuantity",
                          quantity,
                        )
                      }
                      ariaLabel={`Cantidad dañada de ${item.product.name}`}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs md:sr-only">Pérdida</Label>
                    <StockQuantityInput
                      min={0}
                      value={values.lostQuantity}
                      onChange={(quantity) =>
                        updateReconciliation(
                          item.productId,
                          "lostQuantity",
                          quantity,
                        )
                      }
                      ariaLabel={`Cantidad perdida de ${item.product.name}`}
                    />
                  </div>
                  {entered !== expected && (
                    <p className="text-xs text-destructive md:col-span-5">
                      Faltan o sobran {Math.abs(expected - entered)} unidades
                      para cuadrar este producto.
                    </p>
                  )}
                </div>
              );
            })}
            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                El cierre es irreversible. Revisa el conteo físico antes de
                confirmar.
              </p>
              <Button
                variant="destructive"
                onClick={() => setIsCloseConfirmationOpen(true)}
                disabled={isReconciling || !hasBalancedReconciliation}
              >
                {isReconciling && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <RotateCcw className="mr-2 h-4 w-4" />
                Conciliar y cerrar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {event.status === "CLOSED" && (
        <Card>
          <CardHeader>
            <CardTitle>Feria cerrada</CardTitle>
            <CardDescription>
              Conciliada el {formatDate(event.closedAt)}. Las devoluciones ya
              fueron reintegradas al inventario de la tienda en línea.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {event.orders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Últimas ventas</CardTitle>
            <CardDescription>
              Las ventas presenciales también quedan en Pedidos y en los
              reportes tributarios.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {event.orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{order.orderNumber}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(order.createdAt)} ·{" "}
                    {order.payment?.method === "CASH"
                      ? "Efectivo"
                      : "Transferencia"}
                  </p>
                </div>
                <span className="font-semibold">
                  {formatCurrency(order.total)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <AlertDialog
        open={isCloseConfirmationOpen}
        onOpenChange={setIsCloseConfirmationOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar esta feria?</AlertDialogTitle>
            <AlertDialogDescription>
              Se registrarán las devoluciones, daños y pérdidas. Después del
              cierre no podrás seguir agregando ventas ni modificar la
              conciliación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReconciling}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={reconcileFair}
              disabled={isReconciling}
            >
              {isReconciling && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Sí, conciliar y cerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
