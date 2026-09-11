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

interface InventoryMovementClientProps {
  data: InventoryMovementColumn[];
  products: { id: string; name: string; stock: number }[];
  /** Filtro por `referenceId` llegado en la URL (por ejemplo, una feria). */
  reference?: { id: string; label: string | null } | null;
  /** Feria desde la que se llegó a «Conciliar feria anterior». */
  fairContext?: { id: string; name: string; status: string } | null;
  /** Abrir el importador al cargar (enlace desde Ferias). */
  openImporter?: boolean;
}

export const InventoryMovementClient: React.FC<
  InventoryMovementClientProps
> = ({
  data,
  products,
  reference = null,
  fairContext = null,
  openImporter = false,
}) => {
  const params = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reconciliationOpen, setReconciliationOpen] = useState(
    openImporter || fairContext !== null,
  );

  const filters = [
    {
      columnKey: "type",
      title: "Tipo",
      options: Object.entries(typeLabels).map(([value, label]) => ({
        label,
        value,
      })),
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
        <Heading
          title={`Movimientos de Inventario (${data.length})`}
          description="Historial completo de cambios en el stock."
        />
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
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-tint-lavender bg-tint-lavender/30 px-3 py-2 text-sm text-primary"
        >
          <span>
            Mostrando solo los movimientos de{" "}
            <span className="font-semibold">
              {reference.label ?? `la referencia ${reference.id}`}
            </span>{" "}
            ({data.length}).
          </span>
          <Link
            href={`/${params.storeId}/movimientos-inventario`}
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Ver todos
          </Link>
        </div>
      )}
      <DataTable
        searchKey="productName"
        columns={columns}
        data={data}
        tableKey={Models.InventoryMovements}
        filters={filters}
      />
    </>
  );
};
