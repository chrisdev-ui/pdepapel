"use client";

import axios from "axios";
import { CheckCircle2, MessageSquare, MoreHorizontal, RotateCcw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { ConversationRow } from "@/lib/conversations";
import { ConversationStatus } from "@prisma/client";

interface CellActionProps {
  data: ConversationRow;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const storeId = String(params.storeId);
  const isResolved = data.status === ConversationStatus.RESOLVED;

  // Marcar resuelta o reabrir es lo único que se cambia desde aquí: las
  // respuestas siguen saliendo del celular de la dueña.
  const setStatus = async (status: ConversationStatus) => {
    try {
      setLoading(true);
      await axios.patch(`/api/${storeId}/conversations/${data.id}`, { status });
      router.refresh();
      toast({
        title: status === ConversationStatus.RESOLVED ? "Conversación resuelta" : "Conversación reabierta",
        description:
          status === ConversationStatus.RESOLVED
            ? "Sale de la lista de pendientes."
            : "Vuelve a la lista de pendientes.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "No se pudo cambiar el estado",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0" disabled={loading}>
          <span className="sr-only">Abrir menú</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => router.push(`/${storeId}/conversaciones/${data.id}`)}
        >
          <MessageSquare className="mr-2 h-4 w-4" /> Ver conversación
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isResolved ? (
          <DropdownMenuItem onClick={() => setStatus(ConversationStatus.OPEN)}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reabrir
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => setStatus(ConversationStatus.RESOLVED)}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como resuelta
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
