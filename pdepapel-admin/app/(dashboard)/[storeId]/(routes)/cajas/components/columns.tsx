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
import { formatBoxDimensions } from "@/lib/boxes";
import { ColumnDef } from "@tanstack/react-table";
import { Info } from "lucide-react";
import { CellAction } from "./cell-action";

export type BoxColumn = {
  id: string;
  name: string;
  type: string;
  /** Texto de respaldo "ancho x alto x largo" (sin unidad) que arma la página. */
  dimensions: string;
  width?: number;
  height?: number;
  length?: number;
  isDefault: boolean;
  /** Envíos que referencian la caja; decide si se puede eliminar desde la fila. */
  shipmentsCount?: number;
  createdAt: Date;
};

function dimensionsLabel(row: BoxColumn) {
  if (
    typeof row.width === "number" &&
    typeof row.height === "number" &&
    typeof row.length === "number"
  ) {
    return formatBoxDimensions(row.width, row.height, row.length);
  }
  return `${row.dimensions} cm`;
}

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
        title="Dimensiones (ancho × alto × largo)"
      />
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {dimensionsLabel(row.original)}
      </span>
    ),
  },
  {
    accessorKey: "isDefault",
    header: ({ column }) => (
      <div className="flex items-center gap-x-2">
        <DataTableColumnHeader column={column} title="Uso" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger aria-label="Qué significa Uso">
              <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>
              Las cajas &quot;Automáticas&quot; son las que el cotizador elige
              al empacar un pedido: una por tipo (XS, S, M, L, XL). Las
              &quot;Manuales&quot; solo se usan si las eliges en el envío.
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
        {typeof row.original.shipmentsCount === "number" &&
          row.original.shipmentsCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {row.original.shipmentsCount}{" "}
              {row.original.shipmentsCount === 1 ? "envío" : "envíos"}
            </span>
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
