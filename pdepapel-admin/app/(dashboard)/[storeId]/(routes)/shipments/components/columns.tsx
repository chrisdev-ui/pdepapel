"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Models } from "@/constants";
import { getCarrierInfo } from "@/constants/shipping";
import { ShippingProvider, ShippingStatus } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, Package } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getShipments } from "../server/get-shipments";
import { CellAction } from "./cell-action";

export type ShipmentColumn = Awaited<ReturnType<typeof getShipments>>[number];

export const columns: ColumnDef<ShipmentColumn>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Seleccionar todos"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Seleccionar fila"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "trackingCode",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Código de rastreo" />
    ),
    cell: ({ row }) => {
      const trackingCode = row.original.trackingCode;
      const guideUrl = row.original.guideUrl;

      if (!trackingCode)
        return <span className="text-muted-foreground">-</span>;

      return (
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <Link
            href={`/${row.original.storeId}/${Models.Shipments}/${row.original.id}`}
            className="font-mono text-sm text-primary hover:underline"
          >
            {trackingCode}
          </Link>
          {guideUrl && (
            <a
              href={guideUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      );
    },
  },
  {
    id: "carrier",
    accessorKey: "carrierName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Transportadora" />
    ),
    cell: ({ row }) => {
      // Try carrierName first (EnvioClick), fallback to courier (Manual)
      const carrierName = row.original.carrierName || row.original.courier;

      if (!carrierName) {
        return <span className="text-muted-foreground">Sin asignar</span>;
      }

      const carrierInfo = getCarrierInfo(carrierName);

      if (!carrierInfo) {
        return <span className="font-medium">{carrierName}</span>;
      }

      const bgColor = carrierInfo.color || "#f3f4f6";

      return (
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-20 items-center justify-center rounded-md p-2"
            style={{ backgroundColor: bgColor }}
          >
            <Image
              src={carrierInfo.logoUrl}
              alt={carrierInfo.comercialName}
              width={64}
              height={32}
              className="h-full w-full object-contain"
            />
          </div>
          <span className="font-medium">{carrierInfo.comercialName}</span>
        </div>
      );
    },
  },
  {
    id: "provider",
    accessorKey: "provider",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Proveedor" />
    ),
    cell: ({ row }) => {
      const provider = row.original.provider;

      const variants: Record<
        ShippingProvider,
        { variant: "default" | "secondary" | "outline"; text: string }
      > = {
        [ShippingProvider.ENVIOCLICK]: {
          variant: "default",
          text: "EnvioClick",
        },
        [ShippingProvider.MANUAL]: { variant: "secondary", text: "Manual" },
        [ShippingProvider.NONE]: { variant: "outline", text: "Sin definir" },
      };

      return (
        <Badge variant={variants[provider].variant}>
          {variants[provider].text}
        </Badge>
      );
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Estado" />
    ),
    cell: ({ row }) => {
      const status = row.original.status;

      const variants: Record<
        ShippingStatus,
        {
          variant: "outline" | "secondary" | "success" | "destructive";
          text: string;
        }
      > = {
        [ShippingStatus.Preparing]: {
          variant: "outline",
          text: "📦 Preparando",
        },
        [ShippingStatus.Shipped]: {
          variant: "secondary",
          text: "🚀 Despachada",
        },
        [ShippingStatus.PickedUp]: {
          variant: "secondary",
          text: "📮 Recogido",
        },
        [ShippingStatus.InTransit]: {
          variant: "secondary",
          text: "⛟ En tránsito",
        },
        [ShippingStatus.OutForDelivery]: {
          variant: "secondary",
          text: "🚚 En reparto",
        },
        [ShippingStatus.Delivered]: {
          variant: "success",
          text: "🏠 Entregado",
        },
        [ShippingStatus.FailedDelivery]: {
          variant: "destructive",
          text: "❌ Entrega fallida",
        },
        [ShippingStatus.Returned]: {
          variant: "destructive",
          text: "🔙 Retornado",
        },
        [ShippingStatus.Cancelled]: {
          variant: "destructive",
          text: "🚫 Cancelado",
        },
        [ShippingStatus.Exception]: {
          variant: "destructive",
          text: "⚠️ Incidencia",
        },
      };

      return (
        <Badge
          variant={variants[status].variant}
          className="flex items-center justify-center [word-spacing:.2rem]"
        >
          <span className="capitalize tracking-wide">
            {variants[status].text}
          </span>
        </Badge>
      );
    },
  },
  {
    id: "orderNumber",
    accessorKey: "order.orderNumber",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Orden" />
    ),
    cell: ({ row }) => {
      const order = row.original.order;

      if (!order) {
        return <span className="text-muted-foreground">Sin orden</span>;
      }

      return (
        <Link
          href={`/orders/${order.id}`}
          className="font-medium text-primary hover:underline"
        >
          {order.orderNumber}
        </Link>
      );
    },
  },
  {
    id: "customer",
    accessorKey: "order.fullName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Cliente" />
    ),
    cell: ({ row }) => {
      const order = row.original.order;

      if (!order) return <span className="text-muted-foreground">-</span>;

      return (
        <div>
          <div className="font-medium">{order.fullName}</div>
          <div className="text-sm text-muted-foreground">{order.phone}</div>
        </div>
      );
    },
  },
  {
    id: "cost",
    accessorKey: "cost",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Costo de envío" />
    ),
    cell: ({ row }) => {
      const cost = row.original.cost;

      if (!cost) return <span className="text-muted-foreground">-</span>;

      return <DataTableCellCurrency value={cost} />;
    },
  },
  {
    accessorKey: "estimatedDeliveryDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha estimada" />
    ),
    cell: ({ row }) => {
      const date = row.original.estimatedDeliveryDate;

      if (!date) return <span className="text-muted-foreground">-</span>;

      return <DataTableCellDate date={date} />;
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha de creación" />
    ),
    cell: ({ row }) => <DataTableCellDate date={row.original.createdAt} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
