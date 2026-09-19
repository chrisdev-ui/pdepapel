"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { hintMatchesFilter } from "@/lib/attribute-hints";
import { AttributeStatusBadge } from "../../atributos/components/archive-actions";
import { AttributeNameCell, AttributeUpdatedCell, AttributeUsageCell, type Decorated } from "../../atributos/components/attribute-cells";
import { getColors } from "../server/get-colors";
import { CellAction } from "./cell-action";

export type ColorColumn = Awaited<ReturnType<typeof getColors>>[number];
export type ColorRow = Decorated<ColorColumn>;

export function ColorSwatch({ value, className }: { value: string; className?: string }) {
  return <span className={`inline-block h-6 w-6 shrink-0 rounded-md border ${className ?? ""}`} style={{ backgroundColor: value.trim() }} aria-hidden="true" />;
}

function ColorNameCell({ row }: { row: ColorRow }) {
  const params = useParams();
  return <AttributeNameCell href={`/${params.storeId}/colores/${row.id}`} name={row.name} leading={<ColorSwatch value={row.value} className="mt-0.5" />} hints={row.hints} />;
}

export const columns: ColumnDef<ColorRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Color" />,
    cell: ({ row }) => <ColorNameCell row={row.original} />,
    filterFn: (row, _id, filterValue: string[]) => hintMatchesFilter(row.original.hints, filterValue),
  },
  {
    accessorKey: "value",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Valor" />,
    cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.value}</span>,
  },
  {
    id: "products",
    accessorKey: "_count.products",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Productos" />,
    cell: ({ row }) => <AttributeUsageCell usage={row.original.usage} share={row.original.share} />,
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
