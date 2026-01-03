"use client";

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
import { ShippingStatus } from "@prisma/enums";
import { Table } from "@tanstack/react-table";
import { CheckCircle2, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ShipmentColumn } from "./columns";

interface BulkActionsProps {
  table: Table<ShipmentColumn>;
}

const STATUS_ACTIONS = [
  {
    status: ShippingStatus.Shipped,
    label: "🚀 Marcar como Despachada",
    color: "bg-blue-500",
  },
  {
    status: ShippingStatus.PickedUp,
    label: "📮 Marcar como Recogido",
    color: "bg-cyan-500",
  },
  {
    status: ShippingStatus.InTransit,
    label: "⛟ Marcar como En Tránsito",
    color: "bg-yellow-500",
  },
  {
    status: ShippingStatus.OutForDelivery,
    label: "🚚 Marcar como En Reparto",
    color: "bg-orange-500",
  },
  {
    status: ShippingStatus.Delivered,
    label: "🏠 Marcar como Entregado",
    color: "bg-green-500",
  },
  {
    status: ShippingStatus.Exception,
    label: "⚠️ Marcar como Incidencia",
    color: "bg-red-500",
  },
];

export function BulkActions({ table }: BulkActionsProps) {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ShippingStatus | null>(
    null,
  );

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;

  if (selectedCount === 0) return null;

  const handleBulkUpdate = async () => {
    if (!selectedStatus) return;

    try {
      setLoading(true);
      const shipmentIds = selectedRows.map((row) => row.original.id);

      const response = await fetch(
        `/api/${params.storeId}/${Models.Shipments}/bulk-update`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shipmentIds,
            status: selectedStatus,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Error al actualizar");
      }

      const result = await response.json();

      toast({
        title: "Actualización exitosa",
        description: `Se actualizaron ${result.updated} envío(s)`,
      });

      // Clear selection and refresh
      table.resetRowSelection();
      router.refresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          getErrorMessage(error) || "No se pudieron actualizar los envíos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setShowConfirm(false);
      setSelectedStatus(null);
    }
  };

  const confirmAction = (status: ShippingStatus) => {
    setSelectedStatus(status);
    setShowConfirm(true);
  };

  return (
    <>
      <div className="flex items-center gap-2 rounded-md bg-muted p-2">
        <span className="text-sm text-muted-foreground">
          {selectedCount} envío{selectedCount !== 1 ? "s" : ""} seleccionado
          {selectedCount !== 1 ? "s" : ""}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={loading}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Actualizar Estado
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>
              Cambiar estado de {selectedCount} envío(s)
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STATUS_ACTIONS.map((action) => (
              <DropdownMenuItem
                key={action.status}
                onClick={() => confirmAction(action.status)}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => table.resetRowSelection()}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Confirmar actualización masiva?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de actualizar el estado de {selectedCount} envío
              {selectedCount !== 1 ? "s" : ""}. Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkUpdate} disabled={loading}>
              {loading ? "Actualizando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
