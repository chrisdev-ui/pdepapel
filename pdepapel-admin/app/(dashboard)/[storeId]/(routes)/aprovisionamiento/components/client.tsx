"use client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Separator } from "@/components/ui/separator";
import { TintBadge } from "@/components/ui/tint-badge";
import { Models } from "@/constants";
import { RESTOCK_STATUS_LABELS, RESTOCK_STATUS_TONES } from "@/lib/restock-orders";
import { currencyFormatter } from "@/lib/utils";
import { RestockOrderStatus } from "@prisma/client";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import type { RestockOrderRow } from "../server/get-restock-orders";
import { CellAction } from "./cell-action";
import { columns, RestockProgressCell } from "./columns";

interface RestockOrderClientProps {
  data: RestockOrderRow[];
  supplierFilter?: { id: string; name: string } | null;
}

const STATUS_FILTER = {
  columnKey: "status",
  title: "Estado",
  options: (Object.keys(RESTOCK_STATUS_LABELS) as RestockOrderStatus[]).map((status) => ({
    label: RESTOCK_STATUS_LABELS[status],
    value: status,
  })),
};

export const RestockOrderClient: React.FC<RestockOrderClientProps> = ({ data, supplierFilter = null }) => {
  const router = useRouter();
  const params = useParams();
  const storeId = String(params.storeId);
  const open = data.filter((row) => row.status === RestockOrderStatus.ORDERED || row.status === RestockOrderStatus.PARTIALLY_RECEIVED).length;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Heading
          title={`Aprovisionamiento (${data.length})`}
          description={open > 0 ? `${open} ${open === 1 ? "pedido abierto" : "pedidos abiertos"} esperando mercancía.` : "Pedidos a proveedores y recepción de mercancía."}
        />
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <Button asChild>
            <Link href={`/${storeId}/aprovisionamiento/nuevo`}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Crear pedido
            </Link>
          </Button>
        </div>
      </div>
      {supplierFilter && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mostrando solo los pedidos de</span>
          <TintBadge label={supplierFilter.name} tone="lavender" />
          <Button asChild variant="ghost" size="xs">
            <Link href={`/${storeId}/aprovisionamiento`}>
              <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Quitar filtro
            </Link>
          </Button>
        </div>
      )}
      <Separator />
      <DataTable
        tableKey={Models.RestockOrders}
        searchPlaceholder="Buscar por número o proveedor…"
        columns={columns}
        data={data}
        filters={[STATUS_FILTER]}
        onRowClick={(row) => router.push(`/${storeId}/aprovisionamiento/${row.id}`)}
        emptyState={{
          title: "Todavía no hay pedidos de aprovisionamiento",
          description: "Registra lo que le pides a un proveedor y recibe la mercancía desde aquí para que el stock y los costos queden al día.",
          action: (
            <Button asChild>
              <Link href={`/${storeId}/aprovisionamiento/nuevo`}>Crear el primer pedido</Link>
            </Button>
          ),
        }}
        renderMobileCard={(row) => {
          const order = row.original;
          return (
            <div className="flex flex-col gap-2 rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="font-mono text-sm font-semibold text-primary">{order.orderNumber}</span>
                  <span className="truncate text-sm">{order.supplier.name}</span>
                </div>
                <CellAction data={order} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TintBadge label={RESTOCK_STATUS_LABELS[order.status]} tone={RESTOCK_STATUS_TONES[order.status]} />
                <span className="text-sm font-medium">{currencyFormatter(order.total)}</span>
              </div>
              <RestockProgressCell progress={order.progress} />
            </div>
          );
        }}
      />
    </>
  );
};

export default RestockOrderClient;
