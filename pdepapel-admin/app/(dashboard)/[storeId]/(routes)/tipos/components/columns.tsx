"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useParams } from "next/navigation";

import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellNumber } from "@/components/ui/data-table-cell-number";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { TaxonomyIcon } from "@/components/ui/taxonomy-icon";
import { AttributeStatusBadge } from "../../atributos/components/archive-actions";
import { getTypes } from "../server/get-types";
import { CellAction } from "./cell-action";

export type TypeColumn = Awaited<ReturnType<typeof getTypes>>[number];

function TypeNameCell({ row }: { row: TypeColumn }) {
  const params = useParams();
  const source = row.iconSvg ? "propio" : row.icon ? row.icon : "por nombre";
  return (
    <Link href={`/${params.storeId}/tipos/${row.id}`} className="flex items-center gap-2.5 text-primary underline-offset-4 hover:underline">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tint-lavender" title={`Icono: ${source}`}>
        <TaxonomyIcon icon={row.icon} iconSvg={row.iconSvg} name={row.name} slug={row.slug} className="h-[18px] w-[18px]" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{row.name}</span>
        <span className="truncate text-xs font-normal text-muted-foreground">{source}</span>
      </span>
    </Link>
  );
}

export const columns: ColumnDef<TypeColumn>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre" />
    ),
    cell: ({ row }) => <TypeNameCell row={row.original} />,
  },
  {
    id: "categories",
    accessorKey: "_count.categories",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Subcategorías" />
    ),
    cell: ({ row }) => (
      <DataTableCellNumber value={row.original._count.categories} />
    ),
  },
  {
    accessorKey: "isArchived",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Estado" />
    ),
    cell: ({ row }) => <AttributeStatusBadge isArchived={row.original.isArchived} />,
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
