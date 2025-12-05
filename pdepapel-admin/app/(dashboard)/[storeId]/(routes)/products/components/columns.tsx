"use client";

import { Badge } from "@/components/ui/badge";
import { DataTableCellColor } from "@/components/ui/data-table-cell-color";
import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableCellNumber } from "@/components/ui/data-table-cell-number";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { getProducts } from "../server/get-products";
import { CellAction } from "./cell-action";

export type ProductColumn = Awaited<ReturnType<typeof getProducts>>[number];

export const columns: ColumnDef<ProductColumn>[] = [
  {
    id: "image",
    accessorFn: (row) =>
      row.images.find((image) => image.isMain)?.url ??
      row.images[0].url ??
      "https://placehold.co/400",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Imagen" />
    ),
    cell: ({ row }) => (
      <DataTableCellImage
        src={
          row.original.images.find((image) => image.isMain)?.url ??
          row.original.images[0].url ??
          "https://placehold.co/400"
        }
        alt={row.original.name}
        ratio={1 / 1}
        numberOfImages={row.original.images.length}
      />
    ),
    enableSorting: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre" />
    ),
  },
  {
    accessorKey: "price",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Precio" />
    ),
    cell: ({ row }) => {
      const hasDiscount = row.original.hasDiscount;
      const basePrice = row.original.price;
      const discountedPrice = row.original.discountedPrice;

      return (
        <div className="flex flex-col gap-1">
          {hasDiscount ? (
            <>
              <span className="text-xs text-muted-foreground line-through">
                <DataTableCellCurrency value={basePrice} />
              </span>
              <span className="font-semibold text-green-600">
                <DataTableCellCurrency value={discountedPrice} />
              </span>
            </>
          ) : (
            <DataTableCellCurrency value={basePrice} />
          )}
        </div>
      );
    },
  },
  {
    id: "offer",
    accessorKey: "offerLabel",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Oferta" />
    ),
    cell: ({ row }) =>
      row.original.offerLabel ? (
        <Badge variant="secondary" className="text-xs">
          {row.original.offerLabel}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">-</span>
      ),
  },
  {
    id: "category",
    accessorKey: "category.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Categoría" />
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
    cell: ({ row }) => <DataTableCellColor color={row.original.color.value} />,
  },
  {
    accessorKey: "stock",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Stock" />
    ),
    cell: ({ row }) => <DataTableCellNumber value={row.original.stock} />,
  },
  {
    id: "design",
    accessorKey: "design.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Diseño" />
    ),
  },
  {
    accessorKey: "isArchived",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Archivado" />
    ),
    cell: ({ row }) => (
      <Badge variant={row.original.isArchived ? "destructive" : "success"}>
        {row.original.isArchived ? "Sí" : "No"}
      </Badge>
    ),
  },
  {
    accessorKey: "isFeatured",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Destacado" />
    ),
    cell: ({ row }) => (
      <Badge variant={row.original.isFeatured ? "success" : "outline"}>
        {row.original.isFeatured ? "Sí" : "No"}
      </Badge>
    ),
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
