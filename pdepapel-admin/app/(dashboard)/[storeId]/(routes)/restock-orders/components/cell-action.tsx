"use client";

import { useToast } from "@/hooks/use-toast";
import { RestockOrderStatus } from "@prisma/enums";
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

import { useClipboard } from "@/hooks/use-clipboard";
import axios from "axios";
import { RestockOrderColumn } from "./columns";

interface CellActionProps {
  data: RestockOrderColumn;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  const { onCopy } = useClipboard();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${params.storeId}/restock-orders/${data.id}`);
      router.refresh();
      toast({ title: "Pedido eliminado.", variant: "success" });
    } catch (error) {
      toast({ title: "Algo salió mal.", variant: "destructive" });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const isEditable = data.status === RestockOrderStatus.DRAFT;

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Abrir menú</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onCopy(data.id, "ID de Pedido")}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar ID
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              router.push(`/${params.storeId}/restock-orders/${data.id}`)
            }
          >
            <Edit className="mr-2 h-4 w-4" />
            {isEditable ? "Editar" : "Ver detalles"}
          </DropdownMenuItem>
          {isEditable && (
            <DropdownMenuItem onClick={() => setOpen(true)}>
              <Trash className="mr-2 h-4 w-4" />
              Eliminar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
