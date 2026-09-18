"use client";

import axios from "axios";
import { Ban, Copy, Edit, MoreHorizontal, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { getPromotionStatus } from "@/lib/promotion-status";

import type { CouponColumn } from "./columns";

interface CellActionProps {
  data: CouponColumn;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const storeId = String(params.storeId);
  const status = getPromotionStatus(data);
  const canDelete = data.ordersCount === 0;

  const onCopy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ description: message, variant: "success" });
    } catch {
      toast({ description: "No se pudo copiar al portapapeles", variant: "destructive" });
    }
  };

  const onDeactivate = async () => {
    const confirmed = await requestConfirmation({
      title: `¿Desactivar el cupón ${data.code}?`,
      description: "Nadie podrá usarlo desde ahora. Conserva su vigencia y sus usos, y puedes volver a activarlo desde su detalle.",
      confirmLabel: "Desactivar",
    });
    if (!confirmed) return;
    try {
      setLoading(true);
      await axios.put(`/api/${storeId}/coupons/${data.id}`);
      router.refresh();
      toast({ description: `Cupón ${data.code} desactivado`, variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${storeId}/coupons/${data.id}`);
      router.refresh();
      toast({ description: "Cupón eliminado", variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      {confirmationDialog}
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
        title={`¿Eliminar el cupón ${data.code}?`}
        description="Nadie lo ha usado, así que se borra del todo. Esta acción no se puede deshacer."
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Acciones del cupón ${data.code}`}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuItem className="cursor-pointer" onClick={() => void onCopy(data.code, "Código copiado al portapapeles")}>
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            Copiar código
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => router.push(`/${storeId}/cupones/${data.id}`)}>
            <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => void onDeactivate()} disabled={loading || !data.isActive || status === "vencida"}>
            <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
            Desactivar
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => setOpen(true)} disabled={!canDelete}>
            <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
            <span className="flex flex-col">
              Eliminar
              {!canDelete && (
                <span className="text-xs text-muted-foreground">
                  {data.ordersCount} {data.ordersCount === 1 ? "pedido lo referencia" : "pedidos lo referencian"}
                </span>
              )}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
