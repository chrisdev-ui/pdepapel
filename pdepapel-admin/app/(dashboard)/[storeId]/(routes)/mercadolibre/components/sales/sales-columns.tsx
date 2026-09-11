"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { TintBadge } from "@/components/ui/tint-badge";
import {
  getInventoryStatusMeta,
  getSaleStatusMeta,
  isRevenueMarketplaceOrderStatus,
} from "@/lib/mercadolibre/order-status";
import { getSaleNetDisplay, getSettlementLabel } from "@/lib/mercadolibre/sales-views";

import { SaleRowActions } from "./sale-row-actions";
import { formatSaleAmount, formatSaleDate, type MarketplaceSale } from "./sale-types";

/** Tono de la insignia de estado: el mismo vocabulario que Pedidos. */
export const SALE_STATUS_TONE: Record<string, string> = {
  PENDING: "cream",
  PAID: "mint",
  PARTIALLY_REFUNDED: "cream",
  REFUNDED: "pink",
  CANCELLED: "pink",
  SHIPPED: "sky",
  DELIVERED: "mint",
  RETURN_PENDING: "cream",
  RETURNED: "pink",
};

export function describeSaleItems(sale: MarketplaceSale) {
  return sale.items
    .map((item) => `${item.quantity} × ${item.product?.name ?? item.title}`)
    .join(" · ");
}

/** Solo interesa el inventario cuando la venta cobró o cuando algo quedó pendiente. */
export function showsInventory(sale: MarketplaceSale) {
  return (
    sale.inventoryStatus !== "NOT_APPLIED" ||
    isRevenueMarketplaceOrderStatus(sale.status)
  );
}

export function buildSalesColumns({
  busySaleId,
  onResync,
  onConfirmReturn,
}: {
  busySaleId: string | null;
  onResync: (sale: MarketplaceSale) => void;
  onConfirmReturn: (sale: MarketplaceSale) => void;
}): ColumnDef<MarketplaceSale>[] {
  return [
    {
      id: "sale",
      // Primero el número para ordenar; comprador, pack y productos alimentan la búsqueda.
      accessorFn: (row) =>
        [row.externalOrderId, row.externalPackId, row.buyerName, describeSaleItems(row)]
          .filter(Boolean)
          .join(" "),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Venta" />,
      cell: ({ row }) => (
        <div className="flex min-w-0 max-w-[260px] flex-col gap-0.5">
          <span className="font-semibold text-primary">{row.original.externalOrderId}</span>
          <span className="truncate text-xs text-muted-foreground">
            {formatSaleDate(row.original.paidAt)}
            {row.original.buyerName ? ` · ${row.original.buyerName}` : ""}
            {row.original.externalPackId ? ` · Pack ${row.original.externalPackId}` : ""}
          </span>
          <span className="truncate text-xs text-muted-foreground" title={describeSaleItems(row.original)}>
            {describeSaleItems(row.original)}
          </span>
        </div>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => getSaleStatusMeta(row.status).label,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const meta = getSaleStatusMeta(row.original.status);
        return (
          <span className="flex flex-col items-start gap-1">
            <TintBadge label={meta.label} tone={SALE_STATUS_TONE[row.original.status] ?? "slate"} />
            {row.original.refundedAmount && row.original.refundedAmount > 0 ? (
              <span className="text-xs text-muted-foreground">
                Reembolsado {formatSaleAmount(row.original.refundedAmount)}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "inventory",
      accessorFn: (row) => (showsInventory(row) ? getInventoryStatusMeta(row.inventoryStatus).label : ""),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Inventario" />,
      cell: ({ row }) => {
        if (!showsInventory(row.original)) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const meta = getInventoryStatusMeta(row.original.inventoryStatus);
        return (
          <span className="flex max-w-[240px] flex-col items-start gap-1">
            <TintBadge label={meta.label} tone={meta.tone} />
            {row.original.inventoryError ? (
              <span className="text-xs text-muted-foreground" title={row.original.inventoryError}>
                {row.original.inventoryError}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "totalAmount",
      accessorKey: "totalAmount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cobrado" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">{formatSaleAmount(row.original.totalAmount)}</span>
      ),
    },
    {
      id: "marketplaceFee",
      accessorFn: (row) => (row.marketplaceFee ?? 0) + (row.shippingCost ?? 0) + (row.taxesAmount ?? 0),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cargos" />,
      cell: ({ row }) => {
        const sale = row.original;
        const known = sale.marketplaceFee !== null;
        return (
          <span className="flex flex-col whitespace-nowrap text-xs text-muted-foreground">
            <span className="text-sm text-foreground">
              {known
                ? formatSaleAmount(
                    (sale.marketplaceFee ?? 0) + (sale.shippingCost ?? 0) + (sale.taxesAmount ?? 0),
                  )
                : "—"}
            </span>
            {known ? (
              <span>
                ML {formatSaleAmount(sale.marketplaceFee)} · envío {formatSaleAmount(sale.shippingCost)} · imp.{" "}
                {formatSaleAmount(sale.taxesAmount)}
              </span>
            ) : (
              <span>Se conocen al liquidar</span>
            )}
          </span>
        );
      },
    },
    {
      id: "netAmount",
      accessorKey: "netAmount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Neto" />,
      cell: ({ row }) => {
        const sale = row.original;
        return (
          <span className="flex max-w-[200px] flex-col gap-0.5">
            <span className="whitespace-nowrap text-sm font-semibold text-primary">
              {getSaleNetDisplay(sale, formatSaleAmount)}
            </span>
            <span className="text-xs text-muted-foreground">{getSettlementLabel(sale)}</span>
          </span>
        );
      },
    },
    {
      id: "actions",
      enableSorting: false,
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <SaleRowActions
          sale={row.original}
          busySaleId={busySaleId}
          onResync={onResync}
          onConfirmReturn={onConfirmReturn}
        />
      ),
    },
  ];
}
