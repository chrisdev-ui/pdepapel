"use client";

import { ColumnDef } from "@tanstack/react-table";
import axios from "axios";
import { Edit, MoreHorizontal, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { AlertModal } from "@/components/modals/alert-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  HOME_CAMPAIGN_TYPES,
  HOME_CONTENT_PLACEMENTS,
  HOME_CONTENT_STATUS_LABELS,
  type HomeContentStatus,
  getHomeContentStatus,
} from "@/lib/home-content";
import { cn } from "@/lib/utils";

import type { HomeContentRow } from "../../portada/server/get-home-contents";

const STATUS_CLASSES: Record<HomeContentStatus, string> = {
  "en-vivo": "bg-emerald-100 text-emerald-800",
  programada: "bg-amber-100 text-amber-800",
  vencida: "bg-slate-100 text-slate-600",
  borrador: "bg-violet-100 text-violet-800",
};

export function HomeContentStatusBadge({ row }: { row: HomeContentRow }) {
  const status = getHomeContentStatus(row);
  return (
    <Badge variant="outline" className={cn("border-transparent font-semibold", STATUS_CLASSES[status])}>
      {HOME_CONTENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function homeContentKind(row: HomeContentRow) {
  const placement = HOME_CONTENT_PLACEMENTS.find((item) => item.id === row.placement)?.label ?? row.placement;
  const type = HOME_CAMPAIGN_TYPES.find((item) => item.id === row.campaignType)?.label;
  return type ? `${placement} · ${type}` : placement;
}

export function HomeContentCellAction({ data }: { data: HomeContentRow }) {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${params.storeId}/${Models.HomeContent}/${data.id}`);
      router.refresh();
      toast({ description: "Contenido eliminado", variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <AlertModal isOpen={open} onClose={() => setOpen(false)} onConfirm={onDelete} loading={loading} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Abrir menú">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => router.push(`/${params.storeId}/portada/${data.id}`)}>
            <Edit className="mr-2 h-4 w-4" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen(true)}>
            <Trash className="mr-2 h-4 w-4" /> Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export const homeContentColumns: ColumnDef<HomeContentRow>[] = [
  {
    accessorKey: "imageUrl",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Imagen" />,
    cell: ({ row }) =>
      row.original.imageUrl ? (
        <DataTableCellImage className="w-24" src={row.original.imageUrl} alt="" ratio={16 / 10} />
      ) : (
        <span className="text-xs text-muted-foreground">Sin imagen</span>
      ),
    enableSorting: false,
  },
  {
    accessorKey: "title",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Título" />,
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{row.original.title}</span>
        {row.original.eyebrow && <span className="truncate text-xs text-muted-foreground">{row.original.eyebrow}</span>}
      </div>
    ),
  },
  {
    id: "kind",
    accessorFn: (row) => homeContentKind(row),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Ubicación" />,
    cell: ({ row }) => homeContentKind(row.original),
  },
  {
    id: "status",
    accessorFn: (row) => getHomeContentStatus(row),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => <HomeContentStatusBadge row={row.original} />,
  },
  {
    accessorKey: "startsAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Desde" />,
    cell: ({ row }) => <DataTableCellDate date={row.original.startsAt} />,
  },
  {
    accessorKey: "endsAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Hasta" />,
    cell: ({ row }) =>
      row.original.endsAt ? <DataTableCellDate date={row.original.endsAt} /> : <span className="text-muted-foreground">Sin fin</span>,
  },
  {
    id: "actions",
    cell: ({ row }) => <HomeContentCellAction data={row.original} />,
  },
];
