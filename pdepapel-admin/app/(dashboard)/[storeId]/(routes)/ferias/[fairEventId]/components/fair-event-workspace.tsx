"use client";

import axios from "axios";
import {
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileSpreadsheet,
  Loader2,
  PackageCheck,
  PackageX,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  printQrLabelSheet,
  QrLabelPrintSheet,
  type QrPrintLabel,
} from "@/components/labels/qr-label-print-sheet";
import { AlertModal } from "@/components/modals/alert-modal";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { PercentageInput } from "@/components/ui/percentage-input";
import { SectionCard } from "@/components/ui/section-card";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import {
  canCancelFairSale,
  canSellInFair,
  getReconciliationRowState,
  summarizeFairInventory,
  summarizeReconciliation,
  type ReconciliationCount,
} from "@/lib/fair-phases";
import { LABEL_PRINT_FORMATS } from "@/lib/label-printing";
import { capsuleLine, productLine, toSaleItems } from "@/lib/sell-cart";

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
  status: "PAID" | "CANCELLED";
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

type GeneratedCapsule = {
  id: string;
  code: string;
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
    timeZone: "America/Bogota",
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

function Kpi({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Boxes;
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-2xl font-bold text-primary">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function FairEventWorkspace({ event }: { event: FairEventDetail }) {
  const params = useParams();
  const storeId = String(params.storeId);
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
  const [isChangingPhase, setIsChangingPhase] = useState(false);
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
  const [countedPhysically, setCountedPhysically] = useState(false);
  const [reconciliation, setReconciliation] = useState<
    Record<string, ReconciliationCount>
  >({});
  const [saleToCancel, setSaleToCancel] = useState<FairOrder | null>(null);
  const [isCancellingSale, setIsCancellingSale] = useState(false);

  const eventItemsByProduct = useMemo(
    () => new Map(event.inventoryItems.map((item) => [item.productId, item])),
    [event.inventoryItems],
  );
  const inventoryTotals = summarizeFairInventory(event.inventoryItems);
  const paidOrders = event.orders.filter((order) => order.status === "PAID");
  const salesTotal = paidOrders.reduce((total, order) => total + order.total, 0);
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
    setCountedPhysically(false);
  }, [event.id, event.updatedAt, event.inventoryItems]);

  const reconciliationSummary = summarizeReconciliation(
    event.inventoryItems,
    reconciliation,
  );

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
      await axios.post(`/api/${storeId}/fair-events/${event.id}/allocation`, {
        allocations: pendingAllocations.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
      });
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

  async function changePhase(
    action: "open" | "reconcile/start" | "reconcile/reopen",
    success: { title: string; description: string },
    failure: string,
  ) {
    try {
      setIsChangingPhase(true);
      await axios.post(`/api/${storeId}/fair-events/${event.id}/${action}`);
      toast({ ...success, variant: "success" });
      router.refresh();
    } catch (error) {
      toast({
        title: failure,
        description: getErrorMessage(error, "Intenta de nuevo."),
        variant: "destructive",
      });
    } finally {
      setIsChangingPhase(false);
    }
  }

  const openFair = () =>
    changePhase(
      "open",
      {
        title: "Feria abierta para ventas",
        description: "Desde ahora puedes registrar ventas desde este celular.",
      },
      "No se pudo abrir la feria",
    );

  const startReconciliation = () =>
    changePhase(
      "reconcile/start",
      {
        title: "Ventas detenidas",
        description:
          "Cuenta lo no vendido con calma. Si falta vender, puedes reabrir.",
      },
      "No se pudo pasar a conciliación",
    );

  const reopenSales = () =>
    changePhase(
      "reconcile/reopen",
      {
        title: "Ventas reabiertas",
        description: "La feria vuelve a aceptar ventas.",
      },
      "No se pudo reabrir la feria",
    );

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
        `/api/${storeId}/fair-events/${event.id}/capsules`,
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
    field: keyof ReconciliationCount,
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

  async function reconcileFair() {
    if (!reconciliationSummary.balanced) {
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
      const response = await axios.post(
        `/api/${storeId}/fair-events/${event.id}/reconcile`,
        {
          items: event.inventoryItems.map((item) => ({
            productId: item.productId,
            ...reconciliation[item.productId],
          })),
        },
      );
      const issues = Number(response.data?.inventoryIssues ?? 0);
      setIsCloseConfirmationOpen(false);
      toast({
        title: "Feria cerrada",
        description:
          issues > 0
            ? `${issues} devoluciones no pudieron entrar al inventario: quedaron como incidencias en Movimientos.`
            : "Las unidades devueltas regresaron al inventario de la tienda en línea.",
        variant: issues > 0 ? "destructive" : "success",
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

  async function cancelSale() {
    if (!saleToCancel) return;
    try {
      setIsCancellingSale(true);
      await axios.post(
        `/api/${storeId}/fair-events/${event.id}/sales/${saleToCancel.id}/cancel`,
      );
      toast({
        title: "Venta anulada",
        description:
          "Las unidades vuelven a la reserva de la feria. El inventario en línea no cambia.",
        variant: "success",
      });
      setSaleToCancel(null);
      router.refresh();
    } catch (error) {
      toast({
        title: "No se pudo anular la venta",
        description: getErrorMessage(error, "Intenta de nuevo."),
        variant: "destructive",
      });
    } finally {
      setIsCancellingSale(false);
    }
  }

  const canOperate = event.status === "DRAFT" || event.status === "OPEN";
  const sellingOpen = canSellInFair(event.status);
  const reconciling = event.status === "RECONCILING";

  const addReservedProduct = useCallback(
    (add: (line: ReturnType<typeof productLine>) => void, productId: string) => {
      const selected = eventItemsByProduct.get(productId);
      if (!selected) return;
      add(
        productLine({
          productId: selected.productId,
          name: selected.product.name,
          detail: `SKU ${selected.product.sku} · ${getAvailableFairStock(selected)} reservadas`,
          price: selected.product.price,
          maxQuantity: getAvailableFairStock(selected),
          imageUrl: selected.product.images?.[0]?.url ?? null,
        }),
      );
    },
    [eventItemsByProduct],
  );

  // Fuente de la pantalla de venta compartida: solo productos reservados en la feria y cápsulas con QR.
  const fairSellSource = useMemo<SellSource>(
    () => ({
      lookup: async (code) => {
        const response = await axios.get(
          `/api/${storeId}/fair-events/${event.id}/lookup`,
          { params: { code } },
        );
        if (response.data.kind === "capsule") {
          return capsuleLine({
            code: String(response.data.code),
            productId: String(response.data.product.id),
            price: Number(response.data.salePrice),
            detail: `Contiene: ${response.data.product.name}`,
          });
        }
        const product = response.data.product as FairProduct;
        const eventItem = eventItemsByProduct.get(product.id);
        const available = eventItem ? getAvailableFairStock(eventItem) : 0;
        return productLine({
          productId: product.id,
          name: product.name,
          detail: `SKU ${product.sku} · ${available} reservadas`,
          price: Number(product.price),
          maxQuantity: available,
          imageUrl: product.images?.[0]?.url ?? null,
        });
      },
      submit: async ({ lines, paymentMethod, idempotencyKey }) => {
        const response = await axios.post(
          `/api/${storeId}/fair-events/${event.id}/sales`,
          { items: toSaleItems(lines), paymentMethod, idempotencyKey },
        );
        return {
          orderNumber: response.data.order.orderNumber as string,
          duplicate: Boolean(response.data.duplicate),
        };
      },
      renderPicker: (add) => (
        <Combobox
          id="fair-product"
          aria-label="Producto reservado"
          value={null}
          onChange={(productId) => {
            if (productId) addReservedProduct(add, productId);
          }}
          options={availableItems.map((item) => ({
            value: item.productId,
            label: item.product.name,
            description: `${getAvailableFairStock(item)} reservadas · SKU ${item.product.sku}`,
            keywords: [item.product.sku, item.product.gtin ?? ""].filter(
              Boolean,
            ),
          }))}
          placeholder="Buscar producto reservado"
          searchPlaceholder="Nombre o SKU"
          emptyText="Ningún producto reservado coincide."
        />
      ),
      copy: {
        addDescription:
          "Escanea la etiqueta del producto o el QR de la cápsula. Solo se venden unidades reservadas para esta feria.",
        pickerLabel: "Producto reservado",
        scannerDescription:
          "Apunta la cámara a la etiqueta del producto o al QR de la cápsula.",
        confirmNote:
          "Cada venta queda como pedido pagado. Si falta reserva, no se registra ni descuenta parcialmente.",
        submitError:
          "No se cobró la venta; revisa el inventario de feria e intenta de nuevo.",
        saleNoun: "venta de feria",
      },
    }),
    [addReservedProduct, availableItems, event.id, eventItemsByProduct, storeId],
  );

  const headerAction =
    event.status === "DRAFT" ? (
      <Button
        type="button"
        onClick={openFair}
        disabled={event.inventoryItems.length === 0}
        isLoading={isChangingPhase}
      >
        {!isChangingPhase && (
          <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        Abrir para ventas
      </Button>
    ) : event.status === "OPEN" ? (
      <Button
        type="button"
        variant="outline"
        onClick={startReconciliation}
        isLoading={isChangingPhase}
      >
        {!isChangingPhase && (
          <ClipboardCheck className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        Pasar a conciliación
      </Button>
    ) : event.status === "RECONCILING" ? (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={reopenSales}
          isLoading={isChangingPhase}
        >
          {!isChangingPhase && (
            <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Reabrir ventas
        </Button>
        <Button
          type="button"
          onClick={() => setIsCloseConfirmationOpen(true)}
          disabled={isReconciling || !reconciliationSummary.balanced}
        >
          Cerrar la feria
        </Button>
      </>
    ) : null;

  return (
    <div className="space-y-6">
      <FairPhaseHeader
        storeId={storeId}
        name={event.name}
        status={event.status}
        location={event.location}
        startsAt={event.startsAt}
        endsAt={event.endsAt}
        allocated={inventoryTotals.allocated}
        sold={inventoryTotals.sold}
        action={headerAction}
      />
      {event.notes && (
        <p className="text-sm text-muted-foreground">{event.notes}</p>
      )}

      {reconciling && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-tint-cream bg-tint-cream/40 p-4 text-sm text-primary"
        >
          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-semibold">Las ventas están detenidas.</span>{" "}
            Pasaste la feria a conciliación: el panel de venta queda bloqueado
            mientras cuentas. Si aún falta vender, pulsa{" "}
            <span className="font-semibold">Reabrir ventas</span>.
          </p>
        </div>
      )}

      {event.status === "CLOSED" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            icon={CircleDollarSign}
            value={formatCurrency(salesTotal)}
            label={`${paidOrders.length} ventas registradas`}
          />
          <Kpi
            icon={PackageCheck}
            value={`${inventoryTotals.sold} / ${inventoryTotals.allocated}`}
            label="Unidades vendidas / reservadas"
          />
          <Kpi
            icon={Undo2}
            value={`+${inventoryTotals.returned}`}
            label="Devueltas al stock en línea"
          />
          <Kpi
            icon={PackageX}
            value={inventoryTotals.damaged + inventoryTotals.lost}
            label="Dañadas o perdidas (no vuelven al stock)"
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            icon={Boxes}
            value={inventoryTotals.allocated}
            label="Unidades reservadas"
          />
          <Kpi
            icon={PackageCheck}
            value={inventoryTotals.sold}
            label="Unidades vendidas"
          />
          <Kpi
            icon={CircleDollarSign}
            value={formatCurrency(salesTotal)}
            label="Ventas registradas"
          />
          <Kpi
            icon={QrCode}
            value={event.capsules.length}
            label="Cápsulas sorpresa"
          />
        </div>
      )}

      {event.status === "DRAFT" && (
        <SectionCard
          id="inventario"
          title="Reservar inventario"
          description="Las unidades se descuentan ahora de la tienda en línea. Nunca lleves producto sin asignarlo primero a esta feria."
        >
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
              <p className="text-xs text-muted-foreground">
                Los kits se venden en Punto de venta, pero a una feria solo se
                reservan sus componentes: busca cada producto físico del kit.
              </p>
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
                ? `${inventoryTotals.allocated} unidades ya están reservadas para esta feria.`
                : "Aún no hay unidades reservadas."}
            </p>
            <Button
              onClick={submitAllocations}
              disabled={isAllocating || pendingAllocations.length === 0}
            >
              {isAllocating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reservar en inventario
            </Button>
          </div>
        </SectionCard>
      )}

      {canOperate && event.inventoryItems.length > 0 && (
        <SectionCard
          id="capsulas"
          title="Cápsulas sorpresa (opcional)"
          description="Empaca productos ya reservados y genera un QR único. El costo y el margen mínimo se validan antes de crear cada cápsula."
        >
          <div className="grid gap-3 md:grid-cols-4">
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="capsule-product">Producto reservado</Label>
              <Combobox
                id="capsule-product"
                aria-label="Producto reservado para la cápsula"
                value={capsuleProductId || null}
                onChange={(value) => setCapsuleProductId(value ?? "")}
                options={availableItems.map((item) => ({
                  value: item.productId,
                  label: item.product.name,
                  description: `${getAvailableFairStock(item)} disponibles · SKU ${item.product.sku}`,
                  keywords: [item.product.sku],
                }))}
                placeholder="Seleccionar producto"
                searchPlaceholder="Nombre o SKU"
                emptyText="Ningún producto reservado coincide."
              />
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
              {selectedCapsuleProduct?.product.acqPrice && capsulePrice > 0 ? (
                <p>
                  Costo unitario:{" "}
                  {formatCurrency(selectedCapsuleProduct.product.acqPrice)} ·
                  Margen estimado: {calculatedCapsuleMargin?.toFixed(1) || "0.0"}
                  %
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
                    {LABEL_PRINT_FORMATS.STANDARD_40.description}. Este formato
                    protege la lectura de códigos únicos.
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
        </SectionCard>
      )}

      {(sellingOpen || reconciling) && (
        <div id="ventas" className="scroll-mt-24">
          <SellPanel
            source={fairSellSource}
            lockedReason={
              reconciling ? (
                <>
                  Las ventas están detenidas mientras concilias. Si falta
                  vender, pulsa <strong>Reabrir ventas</strong> arriba.
                </>
              ) : undefined
            }
          />
        </div>
      )}

      {sellingOpen && (
        <SectionCard
          id="cierre"
          title="Conciliar y cerrar"
          description="Cuando termine la feria, detén las ventas para contar lo no vendido con calma."
        >
          <p className="text-sm text-muted-foreground">
            Al pasar a conciliación el panel de venta se bloquea y aparece la
            tabla para repartir cada unidad entre devuelta, dañada y perdida.
            Puedes reabrir las ventas si hace falta; el cierre definitivo es un
            paso aparte.
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={startReconciliation}
              isLoading={isChangingPhase}
            >
              {!isChangingPhase && (
                <ClipboardCheck className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Pasar a conciliación
            </Button>
          </div>
        </SectionCard>
      )}

      {reconciling && (
        <SectionCard
          id="cierre"
          tone="care"
          title="Conciliación"
          description="Por cada producto, reparte las unidades no vendidas entre devuelto, dañado y perdido. La suma debe cuadrar con «Por conciliar»."
          action={
            <TintBadge
              label={
                reconciliationSummary.balanced
                  ? "Todo cuadra"
                  : `${event.inventoryItems.length - reconciliationSummary.unbalanced} de ${event.inventoryItems.length} cuadran`
              }
              tone={reconciliationSummary.balanced ? "mint" : "slate"}
            />
          }
        >
          <div className="hidden grid-cols-[minmax(0,1fr)_80px_80px_110px_110px_110px_100px] gap-3 px-2 text-xs font-medium text-muted-foreground md:grid">
            <span>Producto</span>
            <span className="text-right">Reservado</span>
            <span className="text-right">Vendido</span>
            <span>Devuelto</span>
            <span>Dañado</span>
            <span>Perdido</span>
            <span />
          </div>
          {event.inventoryItems.map((item) => {
            const values = reconciliation[item.productId];
            const state = getReconciliationRowState(item, values);
            const soldOut = state.status === "sold-out";
            return (
              <div
                key={item.id}
                className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_80px_80px_110px_110px_110px_100px] md:items-center md:border-0 md:p-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    SKU {item.product.sku} · Por conciliar:{" "}
                    <span className="font-semibold text-primary">
                      {state.expected}
                    </span>
                    {item.packedQuantity > 0 &&
                      ` · ${item.packedQuantity} en cápsulas empacadas`}
                  </p>
                </div>
                <p className="text-sm md:text-right">{item.allocatedQuantity}</p>
                <p className="text-sm md:text-right">{item.soldQuantity}</p>
                <div className="grid gap-1">
                  <Label className="text-xs md:sr-only">Devuelto</Label>
                  <StockQuantityInput
                    min={0}
                    size="sm"
                    disabled={soldOut}
                    value={values?.returnedQuantity ?? 0}
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
                  <Label className="text-xs md:sr-only">Dañado</Label>
                  <StockQuantityInput
                    min={0}
                    size="sm"
                    disabled={soldOut}
                    value={values?.damagedQuantity ?? 0}
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
                  <Label className="text-xs md:sr-only">Perdido</Label>
                  <StockQuantityInput
                    min={0}
                    size="sm"
                    disabled={soldOut}
                    value={values?.lostQuantity ?? 0}
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
                <div>
                  <TintBadge label={state.label} tone={state.tone} />
                </div>
              </div>
            );
          })}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              icon={Undo2}
              value={reconciliationSummary.returned}
              label="Vuelven al stock en línea"
            />
            <Kpi
              icon={PackageX}
              value={reconciliationSummary.damaged}
              label="Dañadas · solo en el registro de la feria"
            />
            <Kpi
              icon={PackageX}
              value={reconciliationSummary.lost}
              label="Perdidas · solo en el registro de la feria"
            />
            <Kpi
              icon={QrCode}
              value={packedCapsules.length}
              label="Cápsulas empacadas que se anulan"
            />
          </div>

          {packedCapsules.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Las cápsulas empacadas sin vender se anulan al cerrar. Cuenta su
              producto como devuelto, dañado o perdido en la fila del producto
              que contienen.
            </p>
          )}

          <div className="flex items-start gap-3 rounded-lg border border-tint-cream bg-tint-cream/40 p-3 text-xs leading-relaxed text-primary">
            <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-semibold">Cerrar es definitivo.</span>{" "}
              Después del cierre no se puede reabrir la feria, registrar más
              ventas ni cambiar estas cantidades. Una venta olvidada se corrige
              después desde{" "}
              <Link
                href={`/${storeId}/movimientos-inventario?feria=${event.id}`}
                className="font-semibold underline underline-offset-2"
              >
                Movimientos → Conciliar feria anterior
              </Link>{" "}
              con la plantilla, no desde aquí.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {!reconciliationSummary.balanced && (
              <p className="text-xs text-muted-foreground sm:mr-auto">
                El botón se activa cuando todas las filas cuadran.
              </p>
            )}
            <Button
              type="button"
              onClick={() => setIsCloseConfirmationOpen(true)}
              disabled={isReconciling || !reconciliationSummary.balanced}
            >
              Cerrar la feria
            </Button>
          </div>
        </SectionCard>
      )}

      {event.status === "CLOSED" && (
        <>
          <SectionCard
            id="despues"
            title="Después del cierre"
            description={`Cerrada el ${formatDate(event.closedAt) ?? "—"}. Todo lo que la feria dejó en el sistema, y el único lugar donde se corrige.`}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Link
                href={`/${storeId}/movimientos-inventario?referencia=${event.id}`}
                className="flex flex-col gap-1 rounded-xl border bg-white p-4 transition-colors hover:bg-accent/40"
              >
                <span className="font-semibold text-primary">
                  Movimientos en el kardex
                </span>
                <span className="text-xs text-muted-foreground">
                  Reserva −{inventoryTotals.allocated} · Devolución +
                  {inventoryTotals.returned}, con referencia a esta feria.
                </span>
              </Link>
              <a
                href="#ventas-feria"
                className="flex flex-col gap-1 rounded-xl border bg-white p-4 transition-colors hover:bg-accent/40"
              >
                <span className="font-semibold text-primary">
                  {paidOrders.length} ventas de feria
                </span>
                <span className="text-xs text-muted-foreground">
                  Pedidos pagados tipo feria; solo lectura. También aparecen en
                  Pedidos y en los reportes tributarios.
                </span>
              </a>
              <Link
                href={`/${storeId}/movimientos-inventario?feria=${event.id}`}
                className="flex flex-col gap-1 rounded-xl border border-tint-pink bg-tint-pink/20 p-4 transition-colors hover:bg-tint-pink/40"
              >
                <span className="inline-flex items-center gap-2 font-semibold text-primary">
                  <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                  ¿Faltó registrar ventas?
                </span>
                <span className="text-xs text-muted-foreground">
                  Conciliar con la plantilla desde Movimientos, ya con esta
                  feria elegida.
                </span>
              </Link>
            </div>
          </SectionCard>

          <SectionCard
            id="inventario-cerrado"
            title="Inventario conciliado"
            description="Solo lectura. Lo devuelto volvió al stock en línea; lo dañado y perdido quedó solo aquí."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-left font-medium">Producto</th>
                    <th className="px-2 py-2 text-right font-medium">Reservado</th>
                    <th className="px-2 py-2 text-right font-medium">Vendido</th>
                    <th className="px-2 py-2 text-right font-medium">Devuelto</th>
                    <th className="px-2 py-2 text-right font-medium">Dañado</th>
                    <th className="px-2 py-2 text-right font-medium">Perdido</th>
                  </tr>
                </thead>
                <tbody>
                  {event.inventoryItems.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-2 py-2">
                        <span className="font-medium">{item.product.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          SKU {item.product.sku}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">{item.allocatedQuantity}</td>
                      <td className="px-2 py-2 text-right">{item.soldQuantity}</td>
                      <td className="px-2 py-2 text-right">{item.returnedQuantity}</td>
                      <td className="px-2 py-2 text-right">{item.damagedQuantity}</td>
                      <td className="px-2 py-2 text-right">{item.lostQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}

      {event.orders.length > 0 && (
        <SectionCard
          id="ventas-feria"
          title={event.status === "CLOSED" ? "Ventas de la feria" : "Últimas ventas"}
          description={
            canCancelFairSale(event.status)
              ? "Cada venta es un pedido pagado. Si te equivocaste, anúlala aquí: las unidades vuelven a la reserva de la feria, nunca al inventario en línea."
              : "Las ventas presenciales también quedan en Pedidos y en los reportes tributarios."
          }
        >
          <div className="space-y-2">
            {event.orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <Link
                      href={`/${storeId}/pedidos/${order.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    {order.status === "CANCELLED" && (
                      <TintBadge label="Anulada" tone="pink" />
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(order.createdAt)} ·{" "}
                    {order.payment?.method === "CASH"
                      ? "Efectivo"
                      : "Transferencia"}{" "}
                    ·{" "}
                    {order.orderItems
                      .map((item) => `${item.quantity} × ${item.name}`)
                      .join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={
                      order.status === "CANCELLED"
                        ? "font-semibold text-muted-foreground line-through"
                        : "font-semibold"
                    }
                  >
                    {formatCurrency(order.total)}
                  </span>
                  {canCancelFairSale(event.status) &&
                    order.status === "PAID" && (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => setSaleToCancel(order)}
                        aria-label={`Anular la venta ${order.orderNumber}`}
                      >
                        <ReceiptText className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        Anular
                      </Button>
                    )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <AlertModal
        isOpen={saleToCancel !== null}
        onClose={() => {
          if (!isCancellingSale) setSaleToCancel(null);
        }}
        onConfirm={cancelSale}
        loading={isCancellingSale}
        title={`¿Anular la venta ${saleToCancel?.orderNumber ?? ""}?`}
        description="El pedido queda cancelado y sus unidades vuelven a la reserva de la feria (una cápsula vuelve a «empacada»). El inventario en línea no cambia porque la reserva sigue vigente. No se puede deshacer."
        confirmLabel="Sí, anular"
        destructive
      />

      <AlertDialog
        open={isCloseConfirmationOpen}
        onOpenChange={(open) => {
          if (!isReconciling) setIsCloseConfirmationOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar «{event.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto es lo que va a pasar. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <TintBadge label={`+${reconciliationSummary.returned}`} tone="mint" />
              <span>
                <strong>{reconciliationSummary.returned} unidades vuelven al stock en línea</strong>{" "}
                y quedan en el kardex como «Devolución de feria».
              </span>
            </li>
            <li className="flex items-start gap-2">
              <TintBadge
                label={String(
                  reconciliationSummary.damaged + reconciliationSummary.lost,
                )}
                tone="pink"
              />
              <span>
                <strong>
                  {reconciliationSummary.damaged} dañadas y{" "}
                  {reconciliationSummary.lost} perdidas
                </strong>{" "}
                no vuelven al stock: quedan solo en el registro de esta feria.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <TintBadge label={String(packedCapsules.length)} tone="lavender" />
              <span>
                <strong>
                  {packedCapsules.length} cápsulas empacadas sin vender se anulan.
                </strong>{" "}
                Su producto ya está contado en la fila que lo contiene.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <TintBadge label={String(paidOrders.length)} tone="sky" />
              <span>
                <strong>Las {paidOrders.length} ventas quedan como pedidos pagados</strong>{" "}
                de tipo feria; ya no se pueden agregar ni anular.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <TintBadge label="Sin reabrir" tone="slate" />
              <span>
                <strong>No se puede reabrir.</strong> Una venta olvidada se
                corrige después desde Movimientos → Conciliar feria anterior.
              </span>
            </li>
          </ul>
          <label className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
            <Checkbox
              checked={countedPhysically}
              onCheckedChange={(checked) =>
                setCountedPhysically(checked === true)
              }
              aria-label="Confirmo que conté la mercancía físicamente"
              className="mt-0.5"
            />
            <span>
              Ya conté la mercancía físicamente y las cantidades de arriba son
              las reales.
            </span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReconciling}>
              Volver a contar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(clickEvent) => {
                clickEvent.preventDefault();
                void reconcileFair();
              }}
              disabled={isReconciling || !countedPhysically}
            >
              {isReconciling && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Cerrar la feria
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
