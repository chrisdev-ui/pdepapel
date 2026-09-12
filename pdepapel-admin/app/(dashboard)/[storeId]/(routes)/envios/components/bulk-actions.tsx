"use client";

import { ShippingStatus } from "@prisma/client";
import { Table } from "@tanstack/react-table";
import { CheckCircle2, FileText } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { getShipmentStatusBadge, pickingTargets } from "@/lib/shipment-views";

import type { DispatchShipment } from "../server/get-shipments";
import type { ShipmentColumn } from "./columns";
import { PickingListButton } from "./picking-list";

interface BulkActionsProps {
  table: Table<ShipmentColumn>;
  dispatch: DispatchShipment[];
}

const STATUS_ACTIONS: ShippingStatus[] = [
  ShippingStatus.Shipped,
  ShippingStatus.PickedUp,
  ShippingStatus.InTransit,
  ShippingStatus.OutForDelivery,
  ShippingStatus.Delivered,
  ShippingStatus.Exception,
];

export function BulkActions({ table, dispatch }: BulkActionsProps) {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ShippingStatus | null>(null);

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;
  if (selectedCount === 0) return null;

  const selectedIds = selectedRows.map((row) => row.original.id);
  const guides = selectedRows.map((row) => row.original.guideUrl).filter((url): url is string => Boolean(url));
  const inDispatch = pickingTargets(dispatch, selectedIds);

  const openGuides = () => {
    let blocked = 0;
    for (const url of guides) {
      if (!window.open(url, "_blank", "noopener")) blocked += 1;
    }
    if (blocked > 0) {
      toast({
        title: "Algunas guías no se abrieron",
        description: "Permite las ventanas emergentes para abrir varias guías a la vez.",
        variant: "destructive",
      });
    }
  };

  const handleBulkUpdate = async () => {
    if (!selectedStatus) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/${params.storeId}/${Models.Shipments}/bulk-update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentIds: selectedIds, status: selectedStatus }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Error al actualizar");
      }
      const result = await response.json();
      toast({ title: "Estado actualizado", description: `Se actualizaron ${result.updated} envío(s).` });
      table.resetRowSelection();
      router.refresh();
    } catch (error) {
      toast({
        title: "No se pudieron actualizar",
        description: getErrorMessage(error) || "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setSelectedStatus(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {inDispatch.length > 0 && (
          <PickingListButton shipments={dispatch} selectedIds={selectedIds} variant="ghost" size="sm" />
        )}
        {guides.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={openGuides}>
            <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
            Abrir guías ({guides.length})
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={loading} isLoading={loading}>
              <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Cambiar estado
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{selectedCount} envío{selectedCount === 1 ? "" : "s"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STATUS_ACTIONS.map((status) => (
              <DropdownMenuItem key={status} onClick={() => setSelectedStatus(status)}>
                Marcar como {getShipmentStatusBadge(status).label.toLowerCase()}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={selectedStatus !== null} onOpenChange={(open) => !open && setSelectedStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar el estado de {selectedCount} envío{selectedCount === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Quedarán como «{selectedStatus ? getShipmentStatusBadge(selectedStatus).label : ""}». Los envíos de EnvioClick pueden volver a cambiar cuando llegue el siguiente evento de rastreo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkUpdate} disabled={loading}>
              {loading ? "Actualizando…" : "Sí, cambiar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
