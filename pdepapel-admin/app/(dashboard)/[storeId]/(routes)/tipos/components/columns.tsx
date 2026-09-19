"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { TaxonomyIcon } from "@/components/ui/taxonomy-icon";
import { hintMatchesFilter } from "@/lib/attribute-hints";
import { AttributeStatusBadge } from "../../atributos/components/archive-actions";
import { AttributeNameCell, AttributeUpdatedCell, AttributeUsageCell, type Decorated } from "../../atributos/components/attribute-cells";
import { getTypes } from "../server/get-types";
import { CellAction } from "./cell-action";

export type TypeColumn = Awaited<ReturnType<typeof getTypes>>[number];
export type TypeRow = Decorated<TypeColumn>;

export function TypeIconBubble({ row, className }: { row: Pick<TypeColumn, "icon" | "iconSvg" | "name" | "slug">; className?: string }) {
  const source = row.iconSvg ? "propio" : row.icon ? row.icon : "por nombre";
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tint-lavender ${className ?? ""}`} title={`Icono: ${source}`}>
      <TaxonomyIcon icon={row.icon} iconSvg={row.iconSvg} name={row.name} slug={row.slug} className="h-[18px] w-[18px]" />
    </span>
  );
}

function TypeNameCell({ row }: { row: TypeRow }) {
  const params = useParams();
  return (
    <AttributeNameCell
      href={`/${params.storeId}/tipos/${row.id}`}
      name={row.name}
      leading={<TypeIconBubble row={row} />}
      secondary={row.iconSvg ? "icono propio" : row.icon ? row.icon : "icono por nombre"}
      hints={row.hints}
    />
  );
}

export const columns: ColumnDef<TypeRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Categoría" />,
    cell: ({ row }) => <TypeNameCell row={row.original} />,
    filterFn: (row, _id, filterValue: string[]) => hintMatchesFilter(row.original.hints, filterValue),
  },
  {
    id: "categories",
    accessorKey: "_count.categories",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subcategorías" />,
    cell: ({ row }) => <span className="tabular-nums">{row.original._count.categories}</span>,
  },
  {
    id: "products",
    accessorKey: "productsCount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Productos" />,
    cell: ({ row }) => <AttributeUsageCell usage={row.original.productsCount} share={row.original.share} />,
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
