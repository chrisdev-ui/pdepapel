"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { TintBadge } from "@/components/ui/tint-badge";
import { hintMatchesFilter } from "@/lib/attribute-hints";
import { AttributeStatusBadge } from "../../atributos/components/archive-actions";
import { AttributeNameCell, AttributeUpdatedCell, AttributeUsageCell, type Decorated } from "../../atributos/components/attribute-cells";
import { getCategories } from "../server/get-categories";
import { CellAction } from "./cell-action";

export type CategoryColumn = Awaited<ReturnType<typeof getCategories>>[number];
export type CategoryRow = Decorated<CategoryColumn>;

export type StorePageState = "destacada" | "indexada" | "no-indexada";

export function storePageState(row: Pick<CategoryColumn, "seoEnabled" | "seoFeatured">): StorePageState {
  if (!row.seoEnabled) return "no-indexada";
  return row.seoFeatured ? "destacada" : "indexada";
}

export function StorePageBadge({ row }: { row: Pick<CategoryColumn, "seoEnabled" | "seoFeatured"> }) {
  const state = storePageState(row);
  if (state === "destacada") return <TintBadge label="Indexada · destacada" tone="sky" />;
  if (state === "indexada") return <TintBadge label="Indexada" tone="sky" />;
  return <TintBadge label="No indexada" tone="slate" />;
}

function CategoryNameCell({ row }: { row: CategoryRow }) {
  const params = useParams();
  return <AttributeNameCell href={`/${params.storeId}/categorias/${row.id}`} name={row.name} hints={row.hints} />;
}

export const columns: ColumnDef<CategoryRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subcategoría" />,
    cell: ({ row }) => <CategoryNameCell row={row.original} />,
    filterFn: (row, _id, filterValue: string[]) => hintMatchesFilter(row.original.hints, filterValue),
  },
  {
    id: "type",
    accessorFn: (row) => row.type.name,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Categoría" />,
    cell: ({ row }) => <span className="text-sm">{row.original.type.name}</span>,
    filterFn: (row, id, filterValue: string[]) => filterValue.includes(row.getValue(id)),
  },
  {
    id: "products",
    accessorKey: "_count.products",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Productos" />,
    cell: ({ row }) => <AttributeUsageCell usage={row.original.usage} share={row.original.share} />,
  },
  {
    id: "seo",
    accessorFn: (row) => storePageState(row),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Página en la tienda" />,
    cell: ({ row }) => <StorePageBadge row={row.original} />,
    filterFn: (row, id, filterValue: string[]) => filterValue.includes(row.getValue(id)),
  },
  {
    accessorKey: "isArchived",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => <AttributeStatusBadge isArchived={row.original.isArchived} />,
  },
  {
    accessorKey: "updatedAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Actualizado" />,
    cell: ({ row }) => <AttributeUpdatedCell date={row.original.updatedAt} />,
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
