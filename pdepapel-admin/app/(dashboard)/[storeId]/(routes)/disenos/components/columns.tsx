"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { hintMatchesFilter } from "@/lib/attribute-hints";
import { AttributeStatusBadge } from "../../atributos/components/archive-actions";
import { AttributeNameCell, AttributeUpdatedCell, AttributeUsageCell, type Decorated } from "../../atributos/components/attribute-cells";
import { getDesigns } from "../server/get-designs";
import { CellAction } from "./cell-action";

export type DesignColumn = Awaited<ReturnType<typeof getDesigns>>[number];
export type DesignRow = Decorated<DesignColumn>;

function DesignNameCell({ row }: { row: DesignRow }) {
  const params = useParams();
  return <AttributeNameCell href={`/${params.storeId}/disenos/${row.id}`} name={row.name} hints={row.hints} />;
}

export const columns: ColumnDef<DesignRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Diseño" />,
    cell: ({ row }) => <DesignNameCell row={row.original} />,
    filterFn: (row, _id, filterValue: string[]) => hintMatchesFilter(row.original.hints, filterValue),
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
