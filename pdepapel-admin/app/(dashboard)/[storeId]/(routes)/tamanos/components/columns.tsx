"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DIMENSIONS, WEIGHTS, parseSizeValue } from "@/constants/sizes";
import { hintMatchesFilter } from "@/lib/attribute-hints";
import { AttributeStatusBadge } from "../../atributos/components/archive-actions";
import { AttributeNameCell, AttributeUsageCell, type Decorated } from "../../atributos/components/attribute-cells";
import { getSizes } from "../server/get-sizes";
import { CellAction } from "./cell-action";

export type SizeColumn = Awaited<ReturnType<typeof getSizes>>[number];
export type SizeRow = Decorated<SizeColumn>;

/** «Pequeño» / «Pesado» a partir del código S-P; vacío si el código no sigue el patrón. */
export function describeSizeValue(value: string): { dimension: string; weight: string } {
  const parsed = parseSizeValue(value);
  if (!parsed) return { dimension: "—", weight: "—" };
  return {
    dimension: DIMENSIONS.find((option) => option.value === parsed.dimension)?.name ?? parsed.dimension,
    weight: WEIGHTS.find((option) => option.value === parsed.weight)?.name ?? parsed.weight,
  };
}

function SizeNameCell({ row }: { row: SizeRow }) {
  const params = useParams();
  return <AttributeNameCell href={`/${params.storeId}/tamanos/${row.id}`} name={row.name} hints={row.hints} />;
}

export const columns: ColumnDef<SizeRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tamaño" />,
    cell: ({ row }) => <SizeNameCell row={row.original} />,
    filterFn: (row, _id, filterValue: string[]) => hintMatchesFilter(row.original.hints, filterValue),
  },
  {
    accessorKey: "value",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Código" />,
    cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.value}</span>,
  },
  {
    id: "dimension",
    accessorFn: (row) => describeSizeValue(row.value).dimension,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Dimensión" />,
  },
  {
    id: "weight",
    accessorFn: (row) => describeSizeValue(row.value).weight,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Peso" />,
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
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
