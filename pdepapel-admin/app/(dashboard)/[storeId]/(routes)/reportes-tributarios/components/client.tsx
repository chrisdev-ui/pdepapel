"use client";

import type { TaxReadiness } from "@/lib/tax-readiness";

import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DataTable } from "@/components/ui/data-table";
import { DateField } from "@/components/ui/date-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionCard } from "@/components/ui/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { TintBadge } from "@/components/ui/tint-badge";
import { Models } from "@/constants";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useToast } from "@/hooks/use-toast";
import {
  formatTaxPeriodLabel,
  getDefaultTaxReportPeriod,
  getTaxReportPeriodPresets,
  isSameTaxReportPeriod,
  matchTaxReportPreset,
  type TaxReportPeriodValue,
} from "@/lib/tax-report-period";
import { cn, currencyFormatter } from "@/lib/utils";
import {
  AlertTriangle,
  Coins,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  buildPurchasesColumns,
  buildSalesColumns,
  type TaxPurchaseRow,
  type TaxSaleRow,
} from "./columns";

type SalesDateBasis = "saleDate" | "paymentDate";

type TaxReport = {
  salesDateBasis: SalesDateBasis;
  sales: TaxSaleRow[];
  purchases: TaxPurchaseRow[];
  salesTotal: number;
  purchasesTotal: number;
  pendingMarketplaceSalesCount: number;
};

type PurchaseForm = {
  id?: string;
  invoiceNumber: string;
  supplierName: string;
  totalAmount: string;
  issuedAt: string;
  notes: string;
};

const emptyPurchaseForm: PurchaseForm = {
  invoiceNumber: "",
  supplierName: "",
  totalAmount: "",
  issuedAt: "",
  notes: "",
};

const READINESS_TONE: Record<string, string> = {
  cream: "bg-tint-cream",
  pink: "bg-tint-pink",
  sky: "bg-tint-sky",
};

/**
 * El cuerpo de la respuesta se leía crudo y se pintaba tal cual: para un 500
 * eso es un JSON en la cara. Se traduce, y el detalle técnico se queda en la
 * consola.
 */
async function readError(response: Response, fallback: string) {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    const message = parsed.error || parsed.message;
    if (message && message.length < 160) return message;
  } catch {
    if (body && body.length < 160 && !body.includes("<")) return body;
  }
  return fallback;
}

export default function TaxReportsClient({
  readiness,
}: {
  readiness?: TaxReadiness;
}) {
  const canWrite = useCanWrite();
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId;

  const defaultPeriod = useMemo(() => getDefaultTaxReportPeriod(), []);
  const presets = useMemo(() => getTaxReportPeriodPresets(), []);

  // Lo que hay escrito en el formulario.
  const [form, setForm] = useState<TaxReportPeriodValue>(defaultPeriod);
  const [salesDateBasis, setSalesDateBasis] =
    useState<SalesDateBasis>("saleDate");
  /**
   * El período **del reporte que está en pantalla**. Es el que manda para
   * descargar: antes el botón leía el formulario, así que cambiar una fecha y
   * no pulsar «Actualizar» producía un Excel de un período que nunca se vio.
   */
  const [applied, setApplied] = useState<{
    period: TaxReportPeriodValue;
    salesDateBasis: SalesDateBasis;
  }>({ period: defaultPeriod, salesDateBasis: "saleDate" });

  const [report, setReport] = useState<TaxReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  // La API contesta 403 a una cuenta de solo lectura. Sin esto, el cuerpo JSON
  // crudo se pintaba tal cual en la pantalla.
  const [forbidden, setForbidden] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] =
    useState<PurchaseForm>(emptyPurchaseForm);

  const pendingChanges =
    !isSameTaxReportPeriod(form, applied.period) ||
    salesDateBasis !== applied.salesDateBasis;
  const activePreset = matchTaxReportPreset(form);

  const loadReport = useCallback(
    async (period: TaxReportPeriodValue, basis: SalesDateBasis) => {
      setIsLoading(true);
      setError("");
      setExportError("");

      try {
        const searchParams = new URLSearchParams({
          startDate: period.startDate,
          endDate: period.endDate,
          salesDateBasis: basis,
        });
        const response = await fetch(
          `/api/${storeId}/tax-reports?${searchParams.toString()}`,
          { cache: "no-store" },
        );

        if (response.status === 403) {
          setForbidden(true);
          setReport(null);
          return;
        }
        if (!response.ok) {
          throw new Error(
            await readError(response, "No fue posible cargar el reporte"),
          );
        }

        setForbidden(false);
        setReport(await response.json());
        setApplied({ period, salesDateBasis: basis });
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No fue posible cargar el reporte tributario",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [storeId],
  );

  useEffect(() => {
    void loadReport(defaultPeriod, "saleDate");
  }, [loadReport, defaultPeriod]);

  const handlePeriodSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadReport(form, salesDateBasis);
  };

  const applyPreset = (preset: TaxReportPeriodValue) => {
    setForm({ startDate: preset.startDate, endDate: preset.endDate });
    void loadReport(
      { startDate: preset.startDate, endDate: preset.endDate },
      salesDateBasis,
    );
  };

  /**
   * La descarga se lleva **el período aplicado**, y pasa por `fetch`.
   *
   * Antes navegaba el navegador a la ruta del archivo: si el servidor fallaba,
   * la pantalla entera desaparecía y quedaba el cuerpo del error en una página
   * en blanco. Es lo que ya hacían Envíos, Cupones y Productos.
   */
  const handleDownload = async () => {
    setIsExporting(true);
    setExportError("");
    try {
      const searchParams = new URLSearchParams({
        startDate: applied.period.startDate,
        endDate: applied.period.endDate,
        salesDateBasis: applied.salesDateBasis,
      });
      const response = await fetch(
        `/api/${storeId}/tax-reports/export?${searchParams.toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(
          await readError(response, "No se pudo preparar el archivo"),
        );
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reporte-tributario-${applied.period.startDate}-a-${applied.period.endDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast({
        title: "Excel descargado",
        description: `Ventas y compras de ${formatTaxPeriodLabel(applied.period)}.`,
      });
    } catch (requestError) {
      setExportError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo preparar el archivo",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const openNewPurchaseDialog = () => {
    /*
      La fecha arrancaba con el inicio del período: un valor plausible y casi
      siempre falso en una casilla que va a un documento tributario. Mejor
      vacía, que se nota.
    */
    setPurchaseForm(emptyPurchaseForm);
    setError("");
    setIsDialogOpen(true);
  };

  const openEditPurchaseDialog = useCallback((purchase: TaxPurchaseRow) => {
    setPurchaseForm({
      id: purchase.id,
      invoiceNumber: purchase.invoiceNumber,
      supplierName: purchase.supplierName,
      totalAmount: String(purchase.totalAmount),
      issuedAt: purchase.issuedAt.slice(0, 10),
      notes: purchase.notes ?? "",
    });
    setError("");
    setIsDialogOpen(true);
  }, []);

  const handlePurchaseSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      const isEditing = Boolean(purchaseForm.id);
      const response = await fetch(
        isEditing
          ? `/api/${storeId}/tax-purchases/${purchaseForm.id}`
          : `/api/${storeId}/tax-purchases`,
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(purchaseForm),
        },
      );

      if (!response.ok) {
        throw new Error(
          await readError(response, "No fue posible guardar la compra"),
        );
      }

      setIsDialogOpen(false);
      await loadReport(applied.period, applied.salesDateBasis);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible guardar la compra",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePurchase = useCallback(
    async (purchase: TaxPurchaseRow) => {
      if (
        !(await requestConfirmation({
          title: "¿Eliminar compra?",
          description: `Se eliminará la factura ${purchase.invoiceNumber} de ${purchase.supplierName}. Esta acción no se puede deshacer.`,
          confirmLabel: "Eliminar compra",
          destructive: true,
        }))
      ) {
        return;
      }

      setError("");
      try {
        const response = await fetch(
          `/api/${storeId}/tax-purchases/${purchase.id}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          throw new Error(
            await readError(response, "No fue posible eliminar la compra"),
          );
        }
        await loadReport(applied.period, applied.salesDateBasis);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No fue posible eliminar la compra",
        );
      }
    },
    [applied, loadReport, requestConfirmation, storeId],
  );

  const dateHeader =
    applied.salesDateBasis === "paymentDate"
      ? "Fecha de pago"
      : "Fecha de venta";

  const salesColumns = useMemo(
    () => buildSalesColumns(storeId, dateHeader),
    [storeId, dateHeader],
  );
  const purchasesColumns = useMemo(
    () => buildPurchasesColumns(openEditPurchaseDialog, handleDeletePurchase, canWrite),
    [openEditPurchaseDialog, handleDeletePurchase, canWrite],
  );

  if (forbidden) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-primary">
          Reportes tributarios
        </h1>
        <SectionCard
          id="tributarios-solo-lectura"
          title="Solo lectura"
          description="Los reportes tributarios los ve solo la dueña de la tienda. Pídele acceso si necesitas el archivo del período."
        >
          <Eye className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            Reportes tributarios
          </h1>
          <p className="text-sm text-muted-foreground">
            Prepara el Excel de ventas y compras para tu contador.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button onClick={handleDownload} disabled={isLoading || isExporting}>
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Descargar Excel
          </Button>
          {/* Qué se lleva el archivo, antes de pulsar y no en la carpeta de descargas. */}
          <span className="text-xs text-muted-foreground">
            El archivo llevará{" "}
            <strong className="text-primary">
              {formatTaxPeriodLabel(applied.period)}
            </strong>
          </span>
        </div>
      </div>

      {exportError && (
        <SectionCard
          id="tributarios-error-export"
          title="No se pudo preparar el archivo"
          description={exportError}
          tone="care"
        >
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reintentar
          </Button>
        </SectionCard>
      )}

      {readiness && (
        <SectionCard
          id="revision-previa"
          title="Antes de exportar"
          description={
            readiness.ready
              ? `Los libros de ${readiness.year} están al día.`
              : `Lo que falta por cuadrar en ${readiness.year}.`
          }
          action={
            <TintBadge
              tone={readiness.ready ? "mint" : "cream"}
              label={
                readiness.ready
                  ? "Listo para exportar"
                  : `${readiness.items.length} por revisar`
              }
            />
          }
        >
          {readiness.ready ? (
            <p className="text-sm text-muted-foreground">
              Ventas con fecha de pago, ventas de Mercado Libre liquidadas y
              facturas de compra al día. Rendimiento usa estimaciones para
              decidir; este reporte usa documentos para declarar, así que sus
              totales pueden diferir.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {readiness.items.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between",
                    READINESS_TONE[item.tone],
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-primary">
                      {item.title}
                    </span>
                    <span className="text-xs text-primary/80">
                      {item.detail}
                    </span>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="shrink-0 bg-white"
                  >
                    <a href={item.href}>Revisar</a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      <SectionCard
        id="periodo-reporte"
        title="Período del reporte"
        description="Elige el rango y con qué fecha entra cada venta. Los totales y las tablas de abajo son siempre de este período."
      >
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const isActive = activePreset?.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => applyPreset(preset)}
                disabled={isLoading}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors sm:min-h-0 sm:h-9",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-white text-primary hover:bg-accent",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <form
          onSubmit={handlePeriodSubmit}
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
        >
          <div className="grid flex-1 gap-2">
            <Label htmlFor="report-start-date">Desde</Label>
            <DateField
              id="report-start-date"
              value={form.startDate}
              onChange={(startDate) =>
                setForm((current) => ({ ...current, startDate }))
              }
              max={form.endDate || undefined}
              required
              presets={false}
            />
          </div>
          <div className="grid flex-1 gap-2">
            <Label htmlFor="report-end-date">Hasta</Label>
            <DateField
              id="report-end-date"
              value={form.endDate}
              onChange={(endDate) =>
                setForm((current) => ({ ...current, endDate }))
              }
              min={form.startDate || undefined}
              required
              presets={false}
            />
          </div>
          <div className="grid flex-1 gap-2">
            <Label htmlFor="report-sales-date-basis">Fecha para ventas</Label>
            <Select
              value={salesDateBasis}
              onValueChange={(value) =>
                setSalesDateBasis(value as SalesDateBasis)
              }
            >
              <SelectTrigger id="report-sales-date-basis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="saleDate">Fecha de venta (pedido)</SelectItem>
                <SelectItem value="paymentDate">
                  Confirmación de pago
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            variant={pendingChanges ? "default" : "outline"}
            disabled={isLoading || !pendingChanges}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {pendingChanges ? "Aplicar" : "Aplicado"}
          </Button>
        </form>

        {/*
          El aviso que faltaba: si el formulario y el reporte no coinciden, el
          botón de descarga se lleva el reporte, no el formulario. Decirlo es lo
          que impide bajarse un archivo de un período que nunca se miró.
        */}
        {pendingChanges && !isLoading && (
          <div className="flex flex-col gap-2 rounded-lg bg-tint-cream p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm text-primary">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                Cambiaste el período y no lo has aplicado. El Excel se llevará{" "}
                <strong>{formatTaxPeriodLabel(applied.period)}</strong>, que es
                lo que ves abajo.
              </span>
            </p>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => void loadReport(form, salesDateBasis)}
            >
              Aplicar
            </Button>
          </div>
        )}
      </SectionCard>

      {error && (
        <SectionCard
          id="tributarios-error"
          title="No se pudo cargar el reporte"
          description={error}
          tone="care"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadReport(applied.period, applied.salesDateBasis)}
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reintentar
          </Button>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard
          label="Ventas incluidas"
          value={isLoading ? "—" : currencyFormatter(report?.salesTotal ?? 0)}
          note={
            isLoading
              ? "Cargando…"
              : `${report?.sales.length ?? 0} ventas con pago o liquidación confirmada`
          }
          icon={<Coins className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-mint"
        />
        <MetricCard
          label="Compras registradas"
          value={
            isLoading ? "—" : currencyFormatter(report?.purchasesTotal ?? 0)
          }
          note={
            isLoading
              ? "Cargando…"
              : `${report?.purchases.length ?? 0} facturas de proveedor`
          }
          icon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-lavender"
        />
      </div>

      {!isLoading && (report?.pendingMarketplaceSalesCount ?? 0) > 0 ? (
        <p className="rounded-lg bg-tint-cream p-3 text-sm text-primary">
          {report?.pendingMarketplaceSalesCount === 1
            ? "Una venta pagada en Mercado Libre aún no se incluye porque falta su liquidación neta."
            : `${report?.pendingMarketplaceSalesCount} ventas pagadas en Mercado Libre aún no se incluyen porque falta su liquidación neta.`}
        </p>
      ) : null}

      <SectionCard
        id="tributarios-ventas"
        title="Ventas"
        description={`Pedidos pagados o enviados y ventas de Mercado Libre ya liquidadas, por ${
          applied.salesDateBasis === "paymentDate"
            ? "confirmación de pago"
            : "fecha de venta del pedido"
        }.`}
      >
        <DataTable
          columns={salesColumns}
          data={report?.sales ?? []}
          tableKey={Models.TaxSales}
          selectable={false}
          searchPlaceholder="Busca orden, persona o canal…"
          isLoading={isLoading}
          filters={[
            {
              columnKey: "channel",
              title: "Canal",
              options: [
                { label: "Tienda en línea", value: "Tienda en línea" },
                { label: "Venta presencial", value: "Venta presencial" },
                { label: "Mercado Libre", value: "Mercado Libre" },
              ],
            },
          ]}
          emptyState={{
            title: "No hay ventas declarables en este período",
            description:
              "Prueba con otro rango, o revisa si faltan pagos por confirmar.",
          }}
          getRowId={(row) => row.orderNumber}
        />
      </SectionCard>

      <SectionCard
        id="tributarios-compras"
        title="Compras"
        description="Registra cada factura de proveedor. No se usan órdenes de aprovisionamiento como sustituto de una factura real."
        action={
          canWrite ? (
            <Button onClick={openNewPurchaseDialog}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Registrar compra
            </Button>
          ) : undefined
        }
      >
        <DataTable
          columns={purchasesColumns}
          data={report?.purchases ?? []}
          tableKey={Models.TaxPurchases}
          selectable={false}
          searchPlaceholder="Busca factura o empresa…"
          isLoading={isLoading}
          emptyState={{
            title: "Todavía no hay facturas en este período",
            description:
              "Registra las facturas de proveedor para incluirlas en el Excel.",
          }}
          getRowId={(row) => row.id}
        />
      </SectionCard>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {purchaseForm.id ? "Editar compra" : "Registrar compra"}
            </DialogTitle>
          </DialogHeader>
          <Separator />
          <form onSubmit={handlePurchaseSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="invoice-number">Número de factura</Label>
              <Input
                id="invoice-number"
                value={purchaseForm.invoiceNumber}
                onChange={(event) =>
                  setPurchaseForm((current) => ({
                    ...current,
                    invoiceNumber: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-name">Nombre de la empresa</Label>
              <Input
                id="supplier-name"
                value={purchaseForm.supplierName}
                onChange={(event) =>
                  setPurchaseForm((current) => ({
                    ...current,
                    supplierName: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="purchase-total">Valor</Label>
                <CurrencyInput
                  id="purchase-total"
                  min="0"
                  value={
                    purchaseForm.totalAmount === ""
                      ? undefined
                      : Number(purchaseForm.totalAmount)
                  }
                  onChange={(value) =>
                    setPurchaseForm((current) => ({
                      ...current,
                      totalAmount: value === undefined ? "" : String(value),
                    }))
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="purchase-issued-at">Fecha de la factura</Label>
                <DateField
                  id="purchase-issued-at"
                  value={purchaseForm.issuedAt}
                  onChange={(issuedAt) =>
                    setPurchaseForm((current) => ({ ...current, issuedAt }))
                  }
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="purchase-notes">Notas (opcional)</Label>
              <Input
                id="purchase-notes"
                value={purchaseForm.notes}
                onChange={(event) =>
                  setPurchaseForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
            {error && (
              <p className="rounded-lg bg-tint-pink p-3 text-sm text-primary">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar compra
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {confirmationDialog}
    </div>
  );
}
