"use client";

import { Button } from "@/components/ui/button";
import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { WhatsappButton } from "@/components/whatsapp-button";
import {
  getNextStep,
  getOrderChannel,
  getOrderQueue,
  getPaymentBadge,
  getShippingBadge,
} from "@/lib/order-queues";
import { currencyFormatter } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { getOrders } from "../server/get-orders";
import { CellAction } from "./cell-action";
import { CHANNEL_TONE, TintBadge } from "./order-badges";
import { ProductList } from "./product-list";

export type OrderColumn = Awaited<ReturnType<typeof getOrders>>[number];

export const orderProducts = (order: OrderColumn) =>
  order.orderItems.map((orderItem) => ({
    id: orderItem.product?.id || "manual",
    name: orderItem.product?.name || orderItem.name,
    sku: orderItem.product?.sku || orderItem.sku || "N/A",
    quantity: orderItem.quantity,
    image:
      orderItem.product?.images.find((image) => image.isMain)?.url ??
      orderItem.product?.images[0]?.url ??
      orderItem.imageUrl ??
      "",
  }));

export const relativeDate = (date: Date | string) =>
  formatDistanceToNowStrict(new Date(date), { addSuffix: true, locale: es });

export const buildColumns = (storeId: string): ColumnDef<OrderColumn>[] => [
  {
    id: "orderNumber",
    // El número va primero para ordenar; el resto solo alimenta la búsqueda global.
    accessorFn: (row) => [row.orderNumber, row.phone, row.documentId, ...row.orderItems.map((item) => item.product?.name || item.name)].filter(Boolean).join(" "),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pedido" />,
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link href={`/${storeId}/pedidos/${row.original.id}`} className="font-semibold text-primary hover:underline">
          {row.original.orderNumber}
        </Link>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span title={new Date(row.original.createdAt).toLocaleString("es-CO")}>{relativeDate(row.original.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <ProductList products={orderProducts(row.original)} compact />
        </span>
      </div>
    ),
  },
  {
    accessorKey: "fullName",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
    cell: ({ row }) => (
      <div className="flex min-w-0 max-w-[170px] flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium">{row.original.fullName}</span>
        <span className="truncate text-[11px] uppercase text-muted-foreground">{row.original.city || row.original.address}</span>
      </div>
    ),
  },
  {
    id: "channel",
    accessorFn: (row) => getOrderChannel(row.type).label,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Canal" />,
    cell: ({ row }) => {
      const channel = getOrderChannel(row.original.type);
      return <TintBadge label={channel.label} tone={CHANNEL_TONE[channel.id]} />;
    },
  },
  {
    id: "payment",
    accessorFn: (row) => getPaymentBadge(row).label,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pago" />,
    cell: ({ row }) => {
      const badge = getPaymentBadge(row.original);
      return <TintBadge label={badge.label} tone={badge.tone} />;
    },
  },
  {
    id: "shipping",
    accessorFn: (row) => getShippingBadge(row)?.label ?? "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Envío" />,
    cell: ({ row }) => {
      const badge = getShippingBadge(row.original);
      return badge ? <TintBadge label={badge.label} tone={badge.tone} /> : <span className="text-xs text-muted-foreground">—</span>;
    },
  },
  {
    id: "totalPrice",
    accessorKey: "total",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
    cell: ({ row }) => <DataTableCellCurrency value={row.original.total} />,
  },
  {
    accessorKey: "phone",
    header: () => <span className="sr-only">WhatsApp</span>,
    cell: ({ row }) => (
      <WhatsappButton
        order={{
          orderNumber: row.original.orderNumber,
          status: row.original.status,
          fullName: row.original.fullName,
          phone: row.original.phone,
          totalPrice: currencyFormatter(row.original.total),
          products: orderProducts(row.original).map(({ name, sku, quantity }) => ({ name, sku, quantity })),
        }}
      />
    ),
    enableSorting: false,
  },
  {
    id: "nextStep",
    header: () => <span className="block text-right">Siguiente paso</span>,
    cell: ({ row }) => {
      const step = getNextStep(getOrderQueue(row.original));
      return (
        <div className="flex items-center justify-end gap-1" data-no-row-click>
          {step && (
            <Button asChild size="xs" variant={step.primary ? "default" : "outline"}>
              <Link href={`/${storeId}/pedidos/${row.original.id}`}>{step.label}</Link>
            </Button>
          )}
          <CellAction data={row.original} />
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
    enableGlobalFilter: false,
  },
];
