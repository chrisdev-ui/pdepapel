"use client";

import { Badge } from "@/components/ui/badge";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import {
  QUOTATION_TYPE_COLORS,
  QUOTATION_TYPE_ICONS,
  QUOTATION_TYPE_LABELS,
} from "@/lib/quotation-types";
import { QuotationType } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";

export type QuotationColumn = {
  id: string;
  name: string;
  type: string;
  isTemplate: boolean;
  isActive: boolean;
  itemCount: number;
  createdAt: Date;
};

export const columns: ColumnDef<QuotationColumn>[] = [
  {
    accessorKey: "name",
    header: "Nombre",
  },
  {
    accessorKey: "type",
    header: "Tipo",
    cell: ({ row }) => {
      const type = row.original.type as QuotationType;
      const Icon = QUOTATION_TYPE_ICONS[type] || QUOTATION_TYPE_ICONS.GENERAL;
      const label = QUOTATION_TYPE_LABELS[type] || type;
      const colorClass = QUOTATION_TYPE_COLORS[type] || "bg-gray-500";

      return (
        <Badge className={`${colorClass} hover:${colorClass} text-white`}>
          <Icon className="mr-2 h-3 w-3" />
          {label}
        </Badge>
      );
    },
  },
  {
    accessorKey: "isTemplate",
    header: "Es Plantilla",
    cell: ({ row }) => (row.original.isTemplate ? "Sí" : "No"),
  },
  {
    accessorKey: "isActive",
    header: "Activa",
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? "default" : "secondary"}>
        {row.original.isActive ? "Sí" : "No"}
      </Badge>
    ),
  },
  {
    accessorKey: "itemCount",
    header: "Ítems",
  },
  {
    accessorKey: "createdAt",
    header: "Fecha",
    cell: ({ row }) => <DataTableCellDate date={row.original.createdAt} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
