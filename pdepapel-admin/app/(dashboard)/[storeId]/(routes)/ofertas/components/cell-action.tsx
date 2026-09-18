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

import type { OfferColumn } from "./columns";
import { OFFER_DELETE_COPY, OFFER_END_COPY } from "./offer-copy";

interface CellActionProps {
  data: OfferColumn;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const storeId = String(params.storeId);
  const status = getPromotionStatus(data);
  const canEnd = data.isActive && (status === "vigente" || status === "programada");

  const onEnd = async () => {
    const confirmed = await requestConfirmation({ title: OFFER_END_COPY.title(data.name), description: OFFER_END_COPY.description, confirmLabel: OFFER_END_COPY.confirmLabel });
    if (!confirmed) return;
    try {
      setLoading(true);
      await axios.put(`/api/${storeId}/offers/${data.id}`);
      router.refresh();
      toast({ description: `Oferta ${data.name} terminada`, variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${storeId}/offers/${data.id}`);
      router.refresh();
      toast({ description: "Oferta eliminada", variant: "success" });
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
      <AlertModal isOpen={open} onClose={() => setOpen(false)} onConfirm={onDelete} loading={loading} title={OFFER_DELETE_COPY.title(data.name)} description={OFFER_DELETE_COPY.description} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Acciones de la oferta ${data.name}`}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuItem className="cursor-pointer" onClick={() => router.push(`/${storeId}/ofertas/${data.id}`)}>
            <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => router.push(`/${storeId}/ofertas/nuevo?desde=${data.id}`)}>
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => void onEnd()} disabled={loading || !canEnd}>
            <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
            <span className="flex flex-col">
              Terminar ahora
              {!canEnd && <span className="text-xs text-muted-foreground">Ya terminó</span>}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => setOpen(true)}>
            <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
