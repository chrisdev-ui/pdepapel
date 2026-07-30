"use client";

import { Badge } from "@/components/ui/badge";
import { DataTableCellColor } from "@/components/ui/data-table-cell-color";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ColumnDef } from "@tanstack/react-table";
import Image from "next/image";
import { getProducts } from "../../server/get-products";

// Reusing the type from the regular products page for consistency
export type ProductColumn = Awaited<ReturnType<typeof getProducts>>[number];

export const columns: ColumnDef<ProductColumn>[] = [
  {
    accessorKey: "images",
    header: "Imagen",
    cell: ({ row }) => {
      const images = row.original.images || [];
      const mainImage = images[0]?.url;

      return (
        <HoverCard>
          <HoverCardTrigger asChild>
            <div className="relative h-10 w-10 cursor-pointer">
              {mainImage ? (
                <Image
                  fill
                  src={mainImage}
                  alt="Product Image"
                  className="rounded-md object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-md bg-gray-100 text-xs text-gray-400">
                  N/A
                </div>
              )}
            </div>
          </HoverCardTrigger>
          {images.length > 0 && (
            <HoverCardContent className="w-80">
              <div className="grid grid-cols-3 gap-2">
                {images.map((img, index) => (
                  <div key={index} className="relative h-20 w-full">
                    <Image
                      fill
                      src={img.url}
                      alt={`Product Image ${index + 1}`}
                      className="rounded-md bg-gray-100 object-cover"
                    />
                  </div>
                ))}
              </div>
            </HoverCardContent>
          )}
        </HoverCard>
      );
    },
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre" />
    ),
  },
  {
    id: "type",
    accessorFn: (row) => (row.productGroupId ? "group" : "single"),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tipo de Fila" />
    ),
    cell: ({ row }) => {
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
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
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
