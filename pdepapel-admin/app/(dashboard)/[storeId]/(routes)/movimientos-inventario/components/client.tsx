"use client";

import { FileSpreadsheet, Plus, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Models } from "@/constants";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { AdjustInventoryModal } from "./adjust-inventory-modal";
import { columns, InventoryMovementColumn, typeLabels } from "./columns";
import { ReconciliationImportModal } from "./reconciliation-import-modal";

const numberFormatter = new Intl.NumberFormat("es-CO");

export interface MovementsScope {
  /** Días de la ventana aplicada; null si se pidió todo el historial. */
  days: number | null;
  /** El tope dejó movimientos por fuera. */
  hasMore: boolean;
  /** Tope de filas aplicado; null si no hubo. */
  take: number | null;
  /** La URL pidió `todo=1`. */
  showAll: boolean;
}

interface InventoryMovementClientProps {
  data: InventoryMovementColumn[];
  products: { id: string; name: string; stock: number }[];
  /** Ventana de fechas y tope con que se cargó la lista (no aplica con `reference`). */
  scope?: MovementsScope | null;
  /** Filtro por `referenceId` llegado en la URL (por ejemplo, una feria). */
  reference?: { id: string; label: string | null } | null;
  /** Filtro por producto llegado en la URL (desde Inventario). */
  product?: { id: string; name: string | null } | null;
  /** Feria desde la que se llegó a «Conciliar feria anterior». */
  fairContext?: { id: string; name: string; status: string } | null;
  /** Abrir el importador al cargar (enlace desde Ferias). */
  openImporter?: boolean;
}

/** Texto de la franja de alcance: qué parte del kardex se está viendo. */
export function describeMovementsScope(scope: MovementsScope, count: number): string {
  const total = `${numberFormatter.format(count)} ${count === 1 ? "movimiento" : "movimientos"}`;
  if (scope.days !== null) return `Mostrando los últimos ${scope.days} días · ${total}`;
  if (scope.hasMore && scope.take) return `Mostrando todo el historial · ${total} (los ${numberFormatter.format(scope.take)} más recientes; hay más antiguos)`;
  return `Mostrando todo el historial · ${total}`;
}

export const InventoryMovementClient: React.FC<InventoryMovementClientProps> = ({
  data,
  products,
  scope = null,
  reference = null,
  product = null,
  fairContext = null,
  openImporter = false,
}) => {
  const params = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reconciliationOpen, setReconciliationOpen] = useState(openImporter || fairContext !== null);

  const base = `/${params.storeId}/movimientos-inventario`;
  const allHistoryHref = product ? `${base}?producto=${encodeURIComponent(product.id)}&todo=1` : `${base}?todo=1`;

  const filters = [
    {
      columnKey: "type",
      title: "Tipo",
      options: Object.entries(typeLabels).map(([value, label]) => ({ label, value })),
    },
  ];

  return (
    <>
      <AdjustInventoryModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          router.refresh();
        }}
        products={products}
        defaultProductId={product?.id ?? null}
      />
      <ReconciliationImportModal
        isOpen={reconciliationOpen}
        onClose={() => setReconciliationOpen(false)}
        onComplete={() => {
          setReconciliationOpen(false);
          router.refresh();
        }}
        fairContext={fairContext}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Heading title={`Movimientos de Inventario (${numberFormatter.format(data.length)})`} description="Historial de cambios en el stock." />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setReconciliationOpen(true)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Conciliar feria anterior
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Ajustar Inventario
          </Button>
        </div>
      </div>
      <Separator />
      {reference && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-tint-lavender bg-tint-lavender/30 px-3 py-2 text-sm text-primary">
          <span>
            Mostrando solo los movimientos de <span className="font-semibold">{reference.label ?? `la referencia ${reference.id}`}</span> ({numberFormatter.format(data.length)}), sin límite de fecha.
          </span>
          <Link href={base} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Ver todos
          </Link>
        </div>
      )}
      {!reference && product && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-tint-lavender bg-tint-lavender/30 px-3 py-2 text-sm text-primary">
          <span>
            Solo el producto <span className="font-semibold">{product.name ?? product.id}</span>.
          </span>
          <Link href={`${base}/producto/${encodeURIComponent(product.id)}`} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
            Ver kardex con saldo
          </Link>
          <Link href={scope?.showAll ? `${base}?todo=1` : base} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Ver todos los productos
          </Link>
        </div>
      )}
      {!reference && scope && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>{describeMovementsScope(scope, data.length)}</span>
          {scope.days !== null && (
            <Link href={allHistoryHref} className="font-semibold text-primary underline underline-offset-2">
              Ver todo el historial
            </Link>
          )}
          {scope.days !== null && scope.hasMore && scope.take && (
            <span>· solo los {numberFormatter.format(scope.take)} más recientes de la ventana</span>
          )}
        </p>
      )}
      <DataTable searchKey="productName" columns={columns} data={data} tableKey={Models.InventoryMovements} filters={filters} />
    </>
  );
};
