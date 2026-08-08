"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";

const DEFAULT_START_DATE = "2025-07-01";
const DEFAULT_END_DATE = "2025-12-31";
const DEFAULT_SALES_DATE_BASIS = "saleDate";

type SalesDateBasis = "saleDate" | "paymentDate";

type TaxSaleRow = {
  orderNumber: string;
  customerName: string;
  channel: "Tienda en línea" | "Mercado Libre";
  totalAmount: number;
  occurredAt: string;
};

type TaxPurchaseRow = {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  totalAmount: number;
  issuedAt: string;
  notes: string | null;
};

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

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function getErrorMessage(response: Response) {
  return response
    .text()
    .then((message) => message || "No fue posible completar la solicitud");
}

export default function TaxReportsClient() {
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId;
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [salesDateBasis, setSalesDateBasis] = useState<SalesDateBasis>(
    DEFAULT_SALES_DATE_BASIS,
  );
  const [report, setReport] = useState<TaxReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] =
    useState<PurchaseForm>(emptyPurchaseForm);

  const loadReport = useCallback(
    async (
      nextStartDate: string,
      nextEndDate: string,
      nextSalesDateBasis: SalesDateBasis,
    ) => {
      setIsLoading(true);
      setError("");

      try {
        const searchParams = new URLSearchParams({
          startDate: nextStartDate,
          endDate: nextEndDate,
          salesDateBasis: nextSalesDateBasis,
        });
        const response = await fetch(
          `/api/${storeId}/tax-reports?${searchParams.toString()}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error(await getErrorMessage(response));
        }

        setReport(await response.json());
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
    void loadReport(
      DEFAULT_START_DATE,
      DEFAULT_END_DATE,
      DEFAULT_SALES_DATE_BASIS,
    );
  }, [loadReport]);

  const handlePeriodSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadReport(startDate, endDate, salesDateBasis);
  };

  const openNewPurchaseDialog = () => {
    setPurchaseForm({
      ...emptyPurchaseForm,
      issuedAt: startDate,
    });
    setError("");
    setIsDialogOpen(true);
  };

  const openEditPurchaseDialog = (purchase: TaxPurchaseRow) => {
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
  };

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
        throw new Error(await getErrorMessage(response));
      }

      setIsDialogOpen(false);
      await loadReport(startDate, endDate, salesDateBasis);
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

  const handleDeletePurchase = async (purchase: TaxPurchaseRow) => {
    if (
      !window.confirm(
        `¿Eliminar la factura ${purchase.invoiceNumber} de ${purchase.supplierName}?`,
      )
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
        throw new Error(await getErrorMessage(response));
      }

      await loadReport(startDate, endDate, salesDateBasis);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible eliminar la compra",
      );
    }
  };

  const handleDownload = () => {
    const searchParams = new URLSearchParams({
      startDate,
      endDate,
      salesDateBasis,
    });
    window.location.assign(
      `/api/${storeId}/tax-reports/export?${searchParams.toString()}`,
    );
  };

  const salesTable = useReactTable<TaxSaleRow>({
    data: report?.sales ?? [],
    columns: [],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  const purchasesTable = useReactTable<TaxPurchaseRow>({
    data: report?.purchases ?? [],
    columns: [],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  useEffect(() => {
    salesTable.setPageIndex(0);
    purchasesTable.setPageIndex(0);
  }, [report, salesTable, purchasesTable]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Reportes tributarios
          </h1>
          <p className="text-sm text-muted-foreground">
            Prepara un archivo Excel con las ventas y compras del período.
          </p>
        </div>
        <Button onClick={handleDownload} disabled={isLoading}>
          <Download className="mr-2 h-4 w-4" />
          Descargar Excel
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Período del reporte</CardTitle>
          <CardDescription>
            Elige cómo se determina la fecha de cada venta. Para recuperar el
            histórico de 2025, usa la fecha de venta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handlePeriodSubmit}
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
          >
            <div className="grid flex-1 gap-2">
              <Label htmlFor="report-start-date">Desde</Label>
              <Input
                id="report-start-date"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </div>
            <div className="grid flex-1 gap-2">
              <Label htmlFor="report-end-date">Hasta</Label>
              <Input
                id="report-end-date"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
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
                  <SelectItem value="saleDate">
                    Fecha de venta (pedido)
                  </SelectItem>
                  <SelectItem value="paymentDate">
                    Confirmación de pago
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" variant="outline" disabled={isLoading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualizar
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ventas incluidas</CardDescription>
            <CardTitle className="text-2xl">
              {isLoading
                ? "—"
                : currencyFormatter.format(report?.salesTotal ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {isLoading
              ? "Cargando..."
              : `${report?.sales.length ?? 0} ventas con pago o liquidación confirmada`}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Compras registradas</CardDescription>
            <CardTitle className="text-2xl">
              {isLoading
                ? "—"
                : currencyFormatter.format(report?.purchasesTotal ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {isLoading
              ? "Cargando..."
              : `${report?.purchases.length ?? 0} facturas de proveedor`}
          </CardContent>
        </Card>
      </div>

      {!isLoading && (report?.pendingMarketplaceSalesCount ?? 0) > 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {report?.pendingMarketplaceSalesCount === 1
            ? "Una venta pagada en Mercado Libre aún no se incluye porque falta su liquidación neta."
            : `${report?.pendingMarketplaceSalesCount} ventas pagadas en Mercado Libre aún no se incluyen porque falta su liquidación neta.`}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Ventas
          </CardTitle>
          <CardDescription>
            Incluye pedidos pagados o enviados y ventas de Mercado Libre con
            liquidación neta confirmada. El período usa{" "}
            {report?.salesDateBasis === "paymentDate"
              ? "la confirmación de pago."
              : "la fecha de venta del pedido."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número de orden</TableHead>
                <TableHead>Nombre de la persona</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>
                  {report?.salesDateBasis === "paymentDate"
                    ? "Fecha de pago"
                    : "Fecha de venta"}
                </TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading && report?.sales.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No hay ventas declarables en este período.
                  </TableCell>
                </TableRow>
              )}
              {salesTable.getRowModel().rows.map((row) => {
                const sale = row.original;

                return (
                  <TableRow key={sale.orderNumber}>
                    <TableCell className="font-medium">
                      {sale.orderNumber}
                    </TableCell>
                    <TableCell>{sale.customerName}</TableCell>
                    <TableCell>{sale.channel}</TableCell>
                    <TableCell>{formatDate(sale.occurredAt)}</TableCell>
                    <TableCell className="text-right">
                      {currencyFormatter.format(sale.totalAmount)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {(report?.sales.length ?? 0) > 0 && (
            <div className="py-3">
              <DataTablePagination table={salesTable} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Compras</CardTitle>
            <CardDescription>
              Registra cada factura de proveedor. No se usan órdenes de
              aprovisionamiento como sustituto de una factura real.
            </CardDescription>
          </div>
          <Button onClick={openNewPurchaseDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Registrar compra
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número de factura</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-[96px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading && report?.purchases.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Registra las facturas de proveedor para incluirlas en el
                    Excel.
                  </TableCell>
                </TableRow>
              )}
              {purchasesTable.getRowModel().rows.map((row) => {
                const purchase = row.original;

                return (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-medium">
                      {purchase.invoiceNumber}
                    </TableCell>
                    <TableCell>{purchase.supplierName}</TableCell>
                    <TableCell>{formatDate(purchase.issuedAt)}</TableCell>
                    <TableCell className="text-right">
                      {currencyFormatter.format(purchase.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar factura ${purchase.invoiceNumber}`}
                          onClick={() => openEditPurchaseDialog(purchase)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Eliminar factura ${purchase.invoiceNumber}`}
                          onClick={() => void handleDeletePurchase(purchase)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {(report?.purchases.length ?? 0) > 0 && (
            <div className="py-3">
              <DataTablePagination table={purchasesTable} />
            </div>
          )}
        </CardContent>
      </Card>

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
                <Input
                  id="purchase-total"
                  type="number"
                  min="0"
                  step="1"
                  value={purchaseForm.totalAmount}
                  onChange={(event) =>
                    setPurchaseForm((current) => ({
                      ...current,
                      totalAmount: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="purchase-issued-at">Fecha</Label>
                <Input
                  id="purchase-issued-at"
                  type="date"
                  value={purchaseForm.issuedAt}
                  onChange={(event) =>
                    setPurchaseForm((current) => ({
                      ...current,
                      issuedAt: event.target.value,
                    }))
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
                {isSaving ? "Guardando..." : "Guardar compra"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
