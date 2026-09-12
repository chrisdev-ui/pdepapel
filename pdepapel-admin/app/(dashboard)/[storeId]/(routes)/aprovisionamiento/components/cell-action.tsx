"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { canTransitionRestockOrder } from "@/lib/restock-orders";
import { RestockOrderStatus } from "@prisma/client";
import axios from "axios";
import { Ban, Eye, MoreHorizontal, PackageCheck, Pencil, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import type { RestockOrderRow } from "../server/get-restock-orders";

interface CellActionProps {
  data: RestockOrderRow;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  const storeId = String(params.storeId);
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [loading, setLoading] = useState(false);

  const isDraft = data.status === RestockOrderStatus.DRAFT;
  const isCancelled = data.status === RestockOrderStatus.CANCELLED;
  const receivable = data.status === RestockOrderStatus.ORDERED || data.status === RestockOrderStatus.PARTIALLY_RECEIVED;
  const context = { receivedUnits: data.progress.receivedUnits };
  const canCancel = canTransitionRestockOrder(data.status, RestockOrderStatus.CANCELLED, context) && !isCancelled;
  const canDelete = (isDraft || isCancelled) && data.progress.receivedUnits === 0;

  const run = async (work: () => Promise<void>, success: string) => {
    try {
      setLoading(true);
      await work();
      router.refresh();
      toast({ title: success, variant: "success" });
    } catch (error) {
      toast({ title: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const onCancel = async () => {
    const confirmed = await requestConfirmation({
      title: `Cancelar el pedido ${data.orderNumber}`,
      description: "No se ha recibido nada, así que el inventario no cambia. El pedido queda como cancelado y podrás volverlo a borrador si hace falta.",
      confirmLabel: "Cancelar pedido",
      cancelLabel: "Volver",
      destructive: true,
    });
    if (!confirmed) return;
    await run(
      () => axios.patch(`/api/${storeId}/restock-orders/${data.id}`, { status: RestockOrderStatus.CANCELLED }).then(() => undefined),
      "Pedido cancelado.",
    );
  };

  const onDelete = async () => {
    const confirmed = await requestConfirmation({
      title: `Eliminar el pedido ${data.orderNumber}`,
      description: isDraft
        ? "Es un borrador: no afectó inventario ni proveedores. Se borra definitivamente."
        : "Está cancelado y no recibió mercancía. Se borra definitivamente; su número no se reutiliza.",
      confirmLabel: "Eliminar",
      cancelLabel: "Volver",
      destructive: true,
    });
    if (!confirmed) return;
    await run(() => axios.delete(`/api/${storeId}/restock-orders/${data.id}`).then(() => undefined), "Pedido eliminado.");
  };

  return (
    <>
      {confirmationDialog}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0" disabled={loading} aria-label={`Acciones del pedido ${data.orderNumber}`}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Pedido {data.orderNumber}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => router.push(`/${storeId}/aprovisionamiento/${data.id}`)}>
            {isDraft ? <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> : <Eye className="mr-2 h-4 w-4" aria-hidden="true" />}
            {isDraft ? "Editar borrador" : "Ver pedido"}
          </DropdownMenuItem>
          {receivable && (
            <DropdownMenuItem onClick={() => router.push(`/${storeId}/aprovisionamiento/${data.id}?recibir=1`)}>
              <PackageCheck className="mr-2 h-4 w-4" aria-hidden="true" />
              Recibir mercancía
            </DropdownMenuItem>
          )}
          {canCancel && (
            <DropdownMenuItem onClick={onCancel}>
              <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
              Cancelar pedido
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
              Eliminar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
