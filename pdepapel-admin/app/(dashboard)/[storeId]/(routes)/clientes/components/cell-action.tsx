"use client";

import { Copy, MessageCircle, MoreHorizontal, UserRound } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

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
import { normalizePhone } from "@/lib/customer-views";

import type { CustomerColumn } from "./columns";

interface CellActionProps {
  data: Pick<CustomerColumn, "id" | "phone" | "email" | "fullName">;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();

  const onCopy = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text);
    toast({ description: message, variant: "success" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" onClick={(event) => event.stopPropagation()}>
          <span className="sr-only">Abrir menú</span>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuLabel>{data.fullName}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => router.push(`/${params.storeId}/clientes/${data.id}`)}>
          <UserRound className="mr-2 h-4 w-4" aria-hidden="true" />
          Ver cliente
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(`https://wa.me/${normalizePhone(data.phone)}`, "_blank", "noopener")}>
          <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
          Escribir por WhatsApp
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void onCopy(data.phone, "Teléfono copiado")}>
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
          Copiar teléfono
        </DropdownMenuItem>
        {data.email && (
          <DropdownMenuItem onClick={() => void onCopy(data.email!, "Correo copiado")}>
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            Copiar correo
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
