"use client";

import { Badge } from "@/components/ui/badge";
import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { RestockOrderStatus } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { getRestockOrders } from "../server/get-restock-orders";
import { CellAction } from "./cell-action";

export type RestockOrderColumn = Awaited<
  ReturnType<typeof getRestockOrders>
>[number];

export const columns: ColumnDef<RestockOrderColumn>[] = [
  {
    accessorKey: "orderNumber",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Pedido #" />
    ),
  },
  {
    accessorKey: "supplier.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Proveedor" />
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Estado" />
    ),
    cell: ({ row }) => {
      const status = row.original.status;
      const variants: Record<
        RestockOrderStatus,
        {
          variant: "outline" | "secondary" | "success" | "destructive";
          text: string;
        }
      > = {
        [RestockOrderStatus.DRAFT]: { variant: "outline", text: "📝 Borrador" },
        [RestockOrderStatus.ORDERED]: {
          variant: "secondary",
          text: "⏳ Pedido",
        },
        [RestockOrderStatus.PARTIALLY_RECEIVED]: {
          variant: "secondary",
          text: "📦 Parc. Recibido",
        },
        [RestockOrderStatus.COMPLETED]: {
          variant: "success",
          text: "✅ Completado",
        },
        [RestockOrderStatus.CANCELLED]: {
          variant: "destructive",
          text: "🚫 Cancelado",
        },
      };
      // Fallback for unexpected status
      const config = variants[status] || { variant: "outline", text: status };

      return (
        <Badge
          variant={config.variant}
          className="flex items-center justify-center"
        >
          {config.text}
        </Badge>
      );
    },
  },
  {
    accessorKey: "totalAmount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Total Esperado" />
    ),
    cell: ({ row }) => (
      <DataTableCellCurrency value={row.original.totalAmount} />
    ),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha" />
    ),
    cell: ({ row }) => <DataTableCellDate date={row.original.createdAt} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
