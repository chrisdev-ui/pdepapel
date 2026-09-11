"use client";

import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { Copy, Edit, MoreHorizontal, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getErrorMessage } from "@/lib/api-errors";
import { boxInUseMessage } from "@/lib/boxes";

import { BoxColumn } from "./columns";

interface CellActionProps {
  data: BoxColumn;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const shipmentsCount = data.shipmentsCount ?? 0;

  const onConfirm = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${params.storeId}/boxes/${data.id}`);
      toast({ title: "Caja eliminada.", variant: "success" });
      router.refresh();
    } catch (error) {
      toast({
        title: "No se pudo eliminar la caja",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setOpen(false);
      setLoading(false);
    }
  };

  const onDeleteRequest = () => {
    if (shipmentsCount > 0) {
      // La API responde 409 con esta misma razón; se explica antes de pedir confirmar.
      toast({
        title: "Esta caja está en uso",
        description: boxInUseMessage(shipmentsCount),
        variant: "destructive",
      });
      return;
    }
    setOpen(true);
  };

  const onCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({
      title: "Código de caja copiado al portapapeles.",
      variant: "default",
    });
  };

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        loading={loading}
        title={`¿Eliminar la caja «${data.name}»?`}
        description="Ningún envío la usa, así que se elimina de inmediato. Esta acción no se puede deshacer."
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            aria-label={`Acciones de la caja ${data.name}`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onCopy(data.id)}>
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            Copiar ID
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push(`/${params.storeId}/cajas/${data.id}`)}
          >
            <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDeleteRequest}>
            <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
