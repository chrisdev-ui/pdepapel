"use client";

import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { getListReadiness, getProductShape } from "@/lib/product-readiness";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { getProducts } from "../server/get-products";
import { CellAction } from "./cell-action";
import { ProductTintBadge, ReadinessBadge, ShapeBadge, StockBadge } from "./product-badges";

export type ProductColumn = Awaited<ReturnType<typeof getProducts>>[number];

export const productImage = (row: ProductColumn) =>
  row.images.find((image) => image.isMain)?.url ?? row.images[0]?.url ?? "https://placehold.co/400";

export const buildColumns = (storeId: string): ColumnDef<ProductColumn>[] => [
  {
    id: "image",
    accessorFn: (row) => productImage(row),
    header: () => <span className="sr-only">Imagen</span>,
    cell: ({ row }) => (
      <DataTableCellImage src={productImage(row.original)} alt={row.original.name} ratio={1 / 1} numberOfImages={row.original.images.length} />
    ),
    enableSorting: false,
    enableGlobalFilter: false,
  },
  {
    id: "name",
    accessorFn: (row) => [row.name, row.sku, row.productGroup?.name].filter(Boolean).join(" "),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Producto" />,
    cell: ({ row }) => (
      <div className="flex min-w-0 max-w-[300px] flex-col gap-0.5">
        <Link href={`/${storeId}/productos/${row.original.id}`} className="truncate font-semibold text-primary hover:underline" title={row.original.name}>
          {row.original.name}
        </Link>
        <span className="truncate text-xs text-muted-foreground">
          {row.original.sku}
          {row.original.productGroup ? ` · ${row.original.productGroup.name}` : ""}
        </span>
      </div>
    ),
  },
  {
    id: "shape",
    accessorFn: (row) => getProductShape(row).label,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Forma" />,
    cell: ({ row }) => <ShapeBadge shape={getProductShape(row.original)} />,
    filterFn: (row, id, filterValue: string[]) => !filterValue?.length || filterValue.includes(row.getValue(id) as string),
  },
  {
    id: "productGroupId",
    accessorFn: (row) => row.productGroup?.id ?? "",
    header: () => null,
    cell: () => null,
    filterFn: (row, id, filterValue: string[]) => !filterValue?.length || filterValue.includes(row.getValue(id) as string),
    enableHiding: false,
    enableSorting: false,
    enableGlobalFilter: false,
  },
  {
    id: "category",
    accessorFn: (row) => row.category?.name ?? "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subcategoría" />,
    cell: ({ row }) => (row.original.category?.name ? <ProductTintBadge label={row.original.category.name} tone="lavender" /> : <span className="text-xs text-muted-foreground">—</span>),
    filterFn: (row, id, filterValue: string[]) => !filterValue?.length || filterValue.includes(row.getValue(id) as string),
  },
  {
    accessorKey: "price",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Precio" />,
    cell: ({ row }) => (
      <div className="flex flex-col items-end gap-0.5">
        <DataTableCellCurrency value={row.original.discountedPrice} />
        {row.original.hasDiscount && (
          <span className="text-[11px] text-muted-foreground line-through">
            <DataTableCellCurrency value={row.original.price} />
          </span>
        )}
      </div>
    ),
    enableGlobalFilter: false,
  },
  {
    accessorKey: "stock",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Stock" />,
    cell: ({ row }) => <StockBadge stock={row.original.stock} isArchived={row.original.isArchived} />,
    enableGlobalFilter: false,
  },
  {
    id: "readiness",
    accessorFn: (row) => (getListReadiness(row).complete ? "Listo" : "Sin completar"),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Listo para vender" />,
    cell: ({ row }) => <ReadinessBadge readiness={getListReadiness(row.original)} />,
    enableGlobalFilter: false,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Creado" />,
    cell: ({ row }) => <DataTableCellDate date={row.original.createdAt} />,
    enableGlobalFilter: false,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Acciones</span>,
    cell: ({ row }) => (
      <div className="flex justify-end" data-no-row-click>
        <CellAction data={row.original} />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    enableGlobalFilter: false,
  },
];
