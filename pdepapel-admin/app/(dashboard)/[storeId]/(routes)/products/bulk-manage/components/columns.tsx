"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableCellColor } from "@/components/ui/data-table-cell-color";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { getProducts } from "../../server/get-products";

// Reusing the type from the regular products page for consistency
export type ProductColumn = Awaited<ReturnType<typeof getProducts>>[number];

export const columns: ColumnDef<ProductColumn>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre" />
    ),
  },
  {
    id: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tipo de Fila" />
    ),
    cell: ({ row }) => {
      const isGroup = !!row.original.productGroupId;
      // In getProducts, we fetch productGroup relation.
      // If row has a productGroup, it's a variant OF a group.
      // BUT WAIT: The specialized get-products return flat list.
      // For bulk manager, we want to know if it belongs to a group.
      // Actually, per plan, we treat rows as individual items, but we need to identify groups if we want to support "Select Group" behavior.
      // However, the current getProducts flattens everything.
      // Let's rely on `productGroup` existence.
      return row.original.productGroup ? (
        <Badge variant="secondary">Variante de Grupo</Badge>
      ) : (
        <Badge variant="outline">Producto Individual</Badge>
      );
    },
  },
  {
    id: "category",
    accessorKey: "category.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Sub-Categoría" />
    ),
  },
  {
    id: "size",
    accessorKey: "size.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tamaño" />
    ),
  },
  {
    id: "color",
    accessorKey: "color.value",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Color" />
    ),
    cell: ({ row }) => <DataTableCellColor color={row.original.color?.value} />,
  },
  {
    id: "design",
    accessorKey: "design.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Diseño" />
    ),
  },
];
