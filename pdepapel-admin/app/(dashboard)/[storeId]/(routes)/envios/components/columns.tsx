"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { getCarrierInfo } from "@/constants/shipping";
import { getShipmentStatusBadge, getStaleInTransitBadge } from "@/lib/shipment-views";
import { ShippingProvider } from "@prisma/client";

import { TintBadge } from "../../pedidos/components/order-badges";
import { relativeDate } from "../../pedidos/components/columns";
import type { ShipmentRow } from "../server/get-shipments";
import { CellAction } from "./cell-action";

export type ShipmentColumn = ShipmentRow;

const SHORT_DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });

export const PROVIDER_LABELS: Record<ShippingProvider, string> = {
  [ShippingProvider.ENVIOCLICK]: "EnvioClick",
  [ShippingProvider.MANUAL]: "Manual",
  [ShippingProvider.NONE]: "Sin definir",
};

export function carrierLabel(shipment: Pick<ShipmentColumn, "carrierName" | "courier">) {
  const raw = shipment.carrierName || shipment.courier;
  if (!raw) return null;
  return getCarrierInfo(raw)?.comercialName ?? raw;
}

export function CarrierCell({ shipment }: { shipment: ShipmentColumn }) {
  const raw = shipment.carrierName || shipment.courier;
  if (!raw) return <span className="text-sm text-muted-foreground">Sin transportadora</span>;
  const info = getCarrierInfo(raw);
  return (
    <div className="flex items-center gap-2">
      {info ? (
        <span
          className="flex h-8 w-12 shrink-0 items-center justify-center rounded-md p-1"
          style={{ backgroundColor: info.color || "#f3f4f6" }}
        >
          <Image src={info.logoUrl} alt="" width={40} height={20} className="h-full w-full object-contain" />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{info?.comercialName ?? raw}</span>
        <span className="text-xs text-muted-foreground">{PROVIDER_LABELS[shipment.provider]}</span>
      </span>
    </div>
  );
}

export function buildColumns(storeId: string): ColumnDef<ShipmentColumn>[] {
  return [
    {
      id: "order",
      accessorFn: (row) => `${row.order?.orderNumber ?? ""} ${row.order?.fullName ?? ""} ${row.order?.phone ?? ""} ${row.order?.city ?? ""}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Pedido" />,
      cell: ({ row }) => {
        const order = row.original.order;
        if (!order) return <span className="text-muted-foreground">Sin pedido</span>;
        return (
          <div className="flex min-w-0 flex-col">
            <Link
              href={`/${storeId}/pedidos/${order.id}#envio`}
              className="truncate text-sm font-semibold text-primary underline-offset-4 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {order.orderNumber}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              {order.fullName}
              {order.city ? ` · ${order.city}` : ""}
            </span>
          </div>
        );
      },
    },
    {
      id: "carrier",
      accessorFn: (row) => carrierLabel(row) ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Transportadora" />,
      cell: ({ row }) => <CarrierCell shipment={row.original} />,
      filterFn: (row, _id, value: string[]) => value.length === 0 || value.includes(carrierLabel(row.original) ?? ""),
    },
    {
      id: "provider",
      accessorKey: "provider",
      header: () => null,
      cell: () => null,
      enableHiding: true,
      filterFn: (row, _id, value: string[]) => value.length === 0 || value.includes(row.original.provider),
    },
    {
      accessorKey: "trackingCode",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Guía" />,
      cell: ({ row }) => {
        const { trackingCode, guideUrl, trackingUrl } = row.original;
        if (!trackingCode) return <span className="text-xs text-muted-foreground">Sin guía</span>;
        return (
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-xs">{trackingCode}</span>
            {guideUrl && (
              <a
                href={guideUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80"
                aria-label={`Abrir guía ${trackingCode}`}
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
            {!guideUrl && trackingUrl && (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80"
                aria-label={`Rastrear ${trackingCode}`}
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const badge = getShipmentStatusBadge(row.original.status);
        const stale = getStaleInTransitBadge(row.original);
        return (
          <span className="flex flex-wrap items-center gap-1">
            <TintBadge label={badge.label} tone={badge.tone} />
            {stale && <TintBadge label={stale.label} tone={stale.tone} />}
          </span>
        );
      },
    },
    {
      accessorKey: "estimatedDeliveryDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Llega" />,
      cell: ({ row }) =>
        row.original.estimatedDeliveryDate ? (
          <span className="whitespace-nowrap text-sm">{SHORT_DATE.format(new Date(row.original.estimatedDeliveryDate))}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "cost",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Costo" />,
      cell: ({ row }) =>
        row.original.cost ? <DataTableCellCurrency value={row.original.cost} /> : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Actualizado" />,
      cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{relativeDate(row.original.updatedAt)}</span>,
    },
    {
      id: "actions",
      cell: ({ row }) => <CellAction data={row.original} />,
    },
  ];
}
