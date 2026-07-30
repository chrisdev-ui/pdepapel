"use client";

import { Badge } from "@/components/ui/badge";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ColumnDef } from "@tanstack/react-table";
import { Info } from "lucide-react";
import { CellAction } from "./cell-action";

export type BoxColumn = {
  id: string;
  name: string;
  type: string;
  dimensions: string;
  isDefault: boolean;
  createdAt: Date;
};

export const columns: ColumnDef<BoxColumn>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre" />
    ),
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tipo" />
    ),
  },
  {
    accessorKey: "dimensions",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Dimensiones (Ancho x Alto x Largo)"
      />
    ),
  },
  {
    accessorKey: "isDefault",
    header: ({ column }) => (
      <div className="flex items-center gap-x-2">
        <DataTableColumnHeader column={column} title="Uso" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              Las cajas &quot;Automáticas&quot; son seleccionadas por el
              algoritmo para empacar órdenes. Solo se usa una por tipo (XS, S,
              M, L, XL).
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-x-2">
        {row.original.isDefault ? (
          <Badge
            variant="default"
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            Automático
          </Badge>
        ) : (
          <Badge variant="secondary">Manual</Badge>
        )}
      </div>
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
