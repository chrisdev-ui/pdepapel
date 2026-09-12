"use client";

import { DataTableCellNumber } from "@/components/ui/data-table-cell-number";
import { DataTableCellPhone } from "@/components/ui/data-table-cell-phone";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { formatSupplierDate, type SupplierRow } from "@/lib/suppliers";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";

export type SupplierColumn = SupplierRow;

/**
 * Las columnas `contact`, `restockOrders` y `lastPurchaseAt` no tienen
 * etiqueta en `ModelsColumns` (constants), así que no se pueden ocultar
 * desde el menú «Columnas»; las que sí la tienen conservan su id.
 */
export const columns: ColumnDef<SupplierColumn>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Proveedor" />
    ),
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <span className="font-medium text-foreground">{row.original.name}</span>
        {row.original.nit && (
          <span className="text-xs text-muted-foreground">
            NIT {row.original.nit}
          </span>
        )}
      </div>
    ),
  },
  {
    id: "contact",
    accessorFn: (row) => row.contactName ?? "",
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Contacto" />
    ),
    cell: ({ row }) => {
      const { contactName, phone } = row.original;
      if (!contactName && !phone) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <div className="flex min-w-0 flex-col">
          {contactName && <span>{contactName}</span>}
          <DataTableCellPhone
            phoneNumber={phone}
            international
            className="text-xs text-muted-foreground"
          />
        </div>
      );
    },
  },
  {
    id: "products",
    accessorFn: (row) => row.usage.products,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Productos" />
    ),
    cell: ({ row }) => (
      <DataTableCellNumber value={row.original.usage.products} />
    ),
  },
  {
    id: "restockOrders",
    accessorFn: (row) => row.usage.restockOrders,
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Pedidos de aprovisionamiento" />
    ),
    cell: ({ row }) => (
      <DataTableCellNumber value={row.original.usage.restockOrders} />
    ),
  },
  {
    id: "lastPurchaseAt",
    accessorFn: (row) => row.usage.lastPurchaseAt?.getTime() ?? 0,
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Última compra" />
    ),
    cell: ({ row }) => {
      const date = row.original.usage.lastPurchaseAt;
      return date ? (
        <span>{formatSupplierDate(date)}</span>
      ) : (
        <span className="text-muted-foreground">Sin compras</span>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
